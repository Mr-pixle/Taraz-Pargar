// Google Sheets API v4 with a service account (JWT bearer, RS256 signed with node:crypto). The service account's
// e-mail is given Editor access to each MDR; Taraz reads the whole MDR tab and writes only the three internal columns.
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

export interface ServiceAccount { client_email: string; private_key: string; token_uri?: string }

export class SheetsError extends Error {
  readonly status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

export interface SheetsClient {
  email: string
  getValues(spreadsheetId: string, range: string): Promise<string[][]>
  batchUpdate(spreadsheetId: string, input: 'RAW' | 'USER_ENTERED', data: { range: string; values: string[][] }[]): Promise<number>
}

export function loadServiceAccount(env: NodeJS.ProcessEnv): ServiceAccount | null {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON || (env.GOOGLE_SERVICE_ACCOUNT_FILE ? readFileSync(env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8') : '')
  if (!raw) return null
  const sa = JSON.parse(raw) as ServiceAccount
  if (!sa.client_email || !sa.private_key) throw new Error('فایل حساب سرویس Google باید client_email و private_key داشته باشد.')
  return sa
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function createSheetsClient(sa: ServiceAccount, opts: { apiBase?: string; tokenUrl?: string; timeoutMs?: number } = {}): SheetsClient {
  const api = (opts.apiBase ?? 'https://sheets.googleapis.com').replace(/\/$/, '')
  const tokenUrl = opts.tokenUrl ?? sa.token_uri ?? 'https://oauth2.googleapis.com/token'
  const timeout = opts.timeoutMs ?? 30_000
  let token: { value: string; exp: number } | null = null

  async function accessToken() {
    if (token && token.exp - 60_000 > Date.now()) return token.value
    const iat = Math.floor(Date.now() / 1000)
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets', aud: tokenUrl, iat, exp: iat + 3600 }))
    const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key).toString('base64url')
    const res = await fetch(tokenUrl, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${sig}` }),
      signal: AbortSignal.timeout(timeout),
    }).catch((e) => { throw new SheetsError(`اتصال به Google برقرار نشد (${(e as Error).message}).`, 0) })
    const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string }
    if (!res.ok || !body.access_token) throw new SheetsError(`ورود حساب سرویس Google ناموفق بود: ${body.error_description ?? res.status}`, res.status)
    token = { value: body.access_token, exp: Date.now() + (body.expires_in ?? 3600) * 1000 }
    return token.value
  }

  async function call(path: string, init: RequestInit = {}) {
    const res = await fetch(`${api}${path}`, {
      ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(timeout),
    }).catch((e) => { throw new SheetsError(`اتصال به Google Sheets برقرار نشد (${(e as Error).message}).`, 0) })
    const body = await res.json().catch(() => ({})) as { error?: { message?: string } } & Record<string, unknown>
    if (!res.ok) {
      const msg = body.error?.message ?? ''
      if (res.status === 403) throw new SheetsError(`حساب سرویس به این Google Sheet دسترسی ندارد؛ MDR را با ${sa.client_email} (Editor) به اشتراک بگذارید.`, 403)
      if (res.status === 404) throw new SheetsError('این Google Sheet پیدا نشد؛ لینک MDR پروژه را بررسی کنید.', 404)
      if (res.status === 400 && /parse range|Unable to parse/i.test(msg)) throw new SheetsError('Tab تعیین‌شده برای MDR در این Google Sheet نیست.', 400)
      if (res.status === 429) throw new SheetsError('سهمیه‌ی Google Sheets موقتاً پر است؛ کمی بعد دوباره امتحان می‌شود.', 429)
      throw new SheetsError(`Google Sheets خطا داد (${res.status}): ${msg}`, res.status)
    }
    return body
  }

  return {
    email: sa.client_email,
    async getValues(id, range) {
      const q = new URLSearchParams({ majorDimension: 'ROWS', valueRenderOption: 'FORMATTED_VALUE' })
      const body = await call(`/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(range)}?${q}`)
      return ((body.values as unknown[][] | undefined) ?? []).map((r) => r.map((x) => (x == null ? '' : String(x))))
    },
    async batchUpdate(id, input, data) {
      if (!data.length) return 0
      const body = await call(`/v4/spreadsheets/${encodeURIComponent(id)}/values:batchUpdate`, { method: 'POST', body: JSON.stringify({ valueInputOption: input, data }) })
      return Number(body.totalUpdatedCells ?? 0)
    },
  }
}
