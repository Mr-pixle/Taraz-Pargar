// Passwords (scrypt, salted, never stored or sent in clear), session cookies and sign-in throttling.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import type { Db, Tx } from './db'

const scrypt = (pw: string, salt: Buffer, len: number, opt: { N: number; r: number; p: number }) =>
  new Promise<Buffer>((res, rej) => scryptCb(pw, salt, len, { ...opt, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))))
const PARAMS = { N: 16384, r: 8, p: 1 }

/** "scrypt$N$r$p$salt$key" (base64) */
export async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  const key = await scrypt(pw.normalize('NFC'), salt, 32, PARAMS)
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`
}
export async function verifyPassword(pw: string, stored: string | undefined) {
  if (!stored) { await hashPassword(pw); return false } // same time whether or not the account exists
  const [alg, N, r, p, salt, key] = stored.split('$')
  if (alg !== 'scrypt') return false
  const want = Buffer.from(key, 'base64')
  const got = await scrypt(pw.normalize('NFC'), Buffer.from(salt, 'base64'), want.length, { N: Number(N), r: Number(r), p: Number(p) })
  return got.length === want.length && timingSafeEqual(got, want)
}

export const PASSWORD_MIN = 6
export function passwordProblem(pw: unknown) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) return `رمز عبور باید دست‌کم ${PASSWORD_MIN} نویسه باشد.`
  if (pw.length > 200) return 'رمز عبور بیش از حد بلند است.'
  return null
}

export async function setPassword(c: Db | Tx, userId: string, pw: string) {
  const h = await hashPassword(pw)
  await c.query('INSERT INTO credentials (user_id, hash) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET hash = EXCLUDED.hash, updated_at = now()', [userId, h])
}
export async function passwordHashOf(db: Db, userId: string) {
  const r = await db.query<{ hash: string }>('SELECT hash FROM credentials WHERE user_id = $1', [userId])
  return r.rows[0]?.hash
}

// ---------- sessions ----------
export const COOKIE = 'taraz_sid'
export const SESSION_DAYS = 14
const tokenHash = (t: string) => createHash('sha256').update(t).digest('base64url')

export async function createSession(db: Db, userId: string) {
  const token = randomBytes(32).toString('base64url')
  await db.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`, [tokenHash(token), userId])
  return token
}
/** The signed-in user of a session token, sliding its expiry forward */
export async function sessionUser(db: Db, token: string | undefined): Promise<{ userId: string; key: string } | null> {
  if (!token || token.length > 200) return null
  const key = tokenHash(token)
  const r = await db.query<{ user_id: string; last_seen: Date }>('SELECT user_id, last_seen FROM sessions WHERE token_hash = $1 AND expires_at > now()', [key])
  const row = r.rows[0]
  if (!row) return null
  if (Date.now() - row.last_seen.getTime() > 10 * 60 * 1000) {
    await db.query(`UPDATE sessions SET last_seen = now(), expires_at = now() + interval '${SESSION_DAYS} days' WHERE token_hash = $1`, [key])
  }
  return { userId: row.user_id, key }
}
export async function dropSession(db: Db, token: string | undefined) {
  if (token) await db.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash(token)])
}
/** After a password change or when an account is disabled: every other session of that person ends */
export async function dropSessionsOf(c: Db | Tx, userId: string, exceptToken?: string) {
  if (exceptToken) await c.query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [userId, tokenHash(exceptToken)])
  else await c.query('DELETE FROM sessions WHERE user_id = $1', [userId])
}

// ---------- throttling of sign-in and sign-up ----------
const WINDOW = 15 * 60 * 1000
const fails = new Map<string, number[]>()
export function throttled(key: string, max = 10) {
  const now = Date.now()
  const list = (fails.get(key) ?? []).filter((t) => now - t < WINDOW)
  fails.set(key, list)
  return list.length >= max
}
export function recordFailure(key: string) {
  const list = fails.get(key) ?? []
  list.push(Date.now())
  fails.set(key, list)
  if (fails.size > 10000) for (const [k, v] of fails) if (!v.some((t) => Date.now() - t < WINDOW)) fails.delete(k)
}
export const clearFailures = (key: string) => fails.delete(key)

export function parseCookies(header: string | undefined) {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
export function sessionCookie(token: string, secure: boolean) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure ? '; Secure' : ''}`
}
export const clearCookie = (secure: boolean) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`
