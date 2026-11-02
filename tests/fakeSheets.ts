// A stand-in for Google's token endpoint and the Sheets API v4 (values.get, values:batchUpdate), for tests.
// It checks the service account's RS256 JWT with the matching public key, keeps each spreadsheet as a grid of strings
// and records every write, so a test can prove that only the three internal columns were touched.
import { createServer, type Server } from 'node:http'
import { createVerify, generateKeyPairSync } from 'node:crypto'

export interface FakeSheets {
  url: string
  serviceAccount: { client_email: string; private_key: string; token_uri: string }
  sheets: Map<string, { tab: string; values: string[][]; denied?: boolean }>
  writes: { id: string; input: string; data: { range: string; values: string[][] }[] }[]
  tokens: number
  /** make the next n calls fail with a 503 */
  failNext: number
  close(): Promise<void>
}

const colIndex = (L: string) => [...L].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

export async function startFakeSheets(): Promise<FakeSheets> {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const email = 'taraz-sync@pargar-test.iam.gserviceaccount.com'
  const fake = { sheets: new Map(), writes: [], tokens: 0, failNext: 0 } as unknown as FakeSheets
  let server: Server
  const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)) }
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const body = Buffer.concat(chunks).toString('utf8')
    const url = new URL(req.url ?? '/', 'http://x')
    if (url.pathname === '/token') {
      const assertion = new URLSearchParams(body).get('assertion') ?? ''
      const [h, c, sig] = assertion.split('.')
      const ok = createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig ?? '', 'base64url'))
      const claims = ok ? JSON.parse(Buffer.from(c, 'base64url').toString()) : {}
      if (!ok || claims.iss !== email || !String(claims.scope).includes('spreadsheets') || claims.aud !== fake.serviceAccount.token_uri) return json(res, 400, { error: 'invalid_grant', error_description: 'bad assertion' })
      fake.tokens++
      return json(res, 200, { access_token: 'tok-1', expires_in: 3600, token_type: 'Bearer' })
    }
    if (req.headers.authorization !== 'Bearer tok-1') return json(res, 401, { error: { message: 'no token' } })
    if (fake.failNext > 0) { fake.failNext--; return json(res, 503, { error: { message: 'backend unavailable' } }) }
    const m = /^\/v4\/spreadsheets\/([^/]+)\/values(?::batchUpdate|\/(.+))$/.exec(url.pathname)
    if (!m) return json(res, 404, { error: { message: 'not found' } })
    const id = decodeURIComponent(m[1])
    const sheet = fake.sheets.get(id)
    if (!sheet) return json(res, 404, { error: { message: 'Requested entity was not found.' } })
    if (sheet.denied) return json(res, 403, { error: { message: 'The caller does not have permission' } })
    const tabOf = (range: string) => (/^'((?:[^']|'')+)'/.exec(range)?.[1] ?? range.split('!')[0]).replace(/''/g, "'")
    if (req.method === 'GET') {
      const range = decodeURIComponent(m[2])
      if (tabOf(range) !== sheet.tab) return json(res, 400, { error: { message: `Unable to parse range: ${range}` } })
      return json(res, 200, { range, majorDimension: 'ROWS', values: sheet.values.map((r) => { const x = [...r]; while (x.length && x[x.length - 1] === '') x.pop(); return x }) })
    }
    const b = JSON.parse(body) as { valueInputOption: string; data: { range: string; values: string[][] }[] }
    let cells = 0
    for (const d of b.data) {
      if (tabOf(d.range) !== sheet.tab) return json(res, 400, { error: { message: `Unable to parse range: ${d.range}` } })
      const a1 = /!([A-Z]+)(\d+)$/.exec(d.range)!
      const r = Number(a1[2]) - 1, c = colIndex(a1[1])
      while (sheet.values.length <= r) sheet.values.push([])
      const row = sheet.values[r]
      while (row.length <= c) row.push('')
      row[c] = d.values[0][0]
      cells++
    }
    fake.writes.push({ id, input: b.valueInputOption, data: b.data })
    return json(res, 200, { totalUpdatedCells: cells })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  const port = (server.address() as { port: number }).port
  fake.url = `http://127.0.0.1:${port}`
  fake.serviceAccount = { client_email: email, private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), token_uri: `${fake.url}/token` }
  fake.close = () => new Promise<void>((r) => { server.closeAllConnections(); server.close(() => r()) })
  return fake
}
