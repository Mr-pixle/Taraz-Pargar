// PostgreSQL storage. The state lives as one row per record (kind + id → JSON, kept exactly as written), written in the same transaction as the
// action that produced it; sessions, password hashes and uploaded files have their own tables.
import pg from 'pg'
import { COLLECTIONS, SHAPES, entriesOf, fromEntries, type Collection, type Data } from '../src/lib/collections'

export type Db = pg.Pool
export type Tx = pg.PoolClient

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entities (
  kind text NOT NULL, id text NOT NULL, data json NOT NULL,
  ins bigserial, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, id)
);
CREATE INDEX IF NOT EXISTS entities_order ON entities (kind, ins);
CREATE TABLE IF NOT EXISTS credentials (user_id text PRIMARY KEY, hash text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY, user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), last_seen timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS files (
  id text PRIMARY KEY, name text NOT NULL, mime text NOT NULL, size integer NOT NULL, data bytea NOT NULL,
  owner text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meta (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
`

export function connect(url: string): Db {
  const pool = new pg.Pool({ connectionString: url, max: 8 })
  pool.on('error', (e) => console.error('[db] idle client error:', e.message))
  return pool
}

export async function migrate(db: Db) {
  await db.query(SCHEMA)
}

export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect()
  try {
    await c.query('BEGIN')
    const r = await fn(c)
    await c.query('COMMIT')
    return r
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

export async function isEmpty(db: Db) {
  const r = await db.query('SELECT 1 FROM entities LIMIT 1')
  return r.rowCount === 0
}

/** Loads every collection, in the order its records were first written */
export async function loadData(db: Db): Promise<Data> {
  const r = await db.query<{ kind: string; id: string; data: unknown }>('SELECT kind, id, data FROM entities ORDER BY ins')
  const by = new Map<string, [string, unknown][]>()
  for (const row of r.rows) {
    if (!by.has(row.kind)) by.set(row.kind, [])
    by.get(row.kind)!.push([row.id, row.data])
  }
  const out = {} as Record<Collection, unknown>
  for (const c of COLLECTIONS) out[c] = fromEntries(c, by.get(c) ?? [])
  return out as Data
}

export interface Change { kind: Collection; upsert: [string, unknown][]; del: string[] }

const same = (c: Collection, a: unknown, b: unknown) => {
  if (a === b) return true
  if (SHAPES[c].type !== 'grouped') return false
  const x = a as unknown[], y = b as unknown[]
  return x.length === y.length && x.every((v, i) => v === y[i])
}

/**
 * What changed between two states. The reducer never mutates, so an unchanged record is the very same object:
 * comparing references finds the changed rows without serialising anything.
 * New rows of a newest-first collection are listed oldest first, so their insertion order matches their age.
 */
export function diffData(prev: Partial<Data> | null, next: Data): Change[] {
  const out: Change[] = []
  for (const c of COLLECTIONS) {
    if (prev && prev[c] === next[c]) continue
    const before = new Map(prev ? entriesOf(c, prev[c]) : [])
    const after = entriesOf(c, next[c])
    const upsert: [string, unknown][] = []
    const fresh: [string, unknown][] = []
    const seen = new Set<string>()
    for (const [k, v] of after) {
      seen.add(k)
      if (!before.has(k)) fresh.push([k, v])
      else if (!same(c, before.get(k), v)) upsert.push([k, v])
    }
    const s = SHAPES[c]
    if (s.type === 'array' && s.order === 'prepend') fresh.reverse()
    const del = [...before.keys()].filter((k) => !seen.has(k))
    if (upsert.length || fresh.length || del.length) out.push({ kind: c, upsert: [...upsert, ...fresh], del })
  }
  return out
}

/** Records never stored: a password must never reach the entities table */
function clean(kind: Collection, v: unknown) {
  if (kind === 'users' && v && typeof v === 'object' && 'password' in (v as object)) {
    const { password: _p, ...rest } = v as Record<string, unknown>
    return rest
  }
  return v
}

export async function writeChanges(c: Tx, changes: Change[]) {
  for (const ch of changes) {
    for (let i = 0; i < ch.upsert.length; i += 1000) {
      const part = ch.upsert.slice(i, i + 1000).map(([id, d]) => ({ id, d: clean(ch.kind, d) }))
      await c.query(
        `INSERT INTO entities (kind, id, data)
         SELECT $1, e.value->>'id', e.value->'d' FROM json_array_elements($2::json) WITH ORDINALITY AS e(value, n) ORDER BY e.n
         ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
        [ch.kind, JSON.stringify(part)],
      )
    }
    if (ch.del.length) await c.query('DELETE FROM entities WHERE kind = $1 AND id = ANY($2::text[])', [ch.kind, ch.del])
  }
}

export async function getMeta<T>(db: Db | Tx, key: string): Promise<T | undefined> {
  const r = await db.query<{ value: T }>('SELECT value FROM meta WHERE key = $1', [key])
  return r.rows[0]?.value
}
export async function setMeta(db: Db | Tx, key: string, value: unknown) {
  await db.query('INSERT INTO meta (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, JSON.stringify(value)])
}
