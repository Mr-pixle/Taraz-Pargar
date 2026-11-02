// Taraz server: `node server-dist/main.mjs`. Configuration comes from the environment (see README › Deployment).
import { createServer } from 'node:http'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { setIdBase, type State } from '../src/lib/state'
import { refreshToday } from '../src/lib/seed'
import { setPassword } from './auth'
import { demoState, productionState } from './bootstrap'
import { connect, diffData, isEmpty, loadData, migrate, tx, writeChanges, setMeta } from './db'
import { Core } from './core'
import { Jobs } from './jobs'
import { createApp } from './http'
import { createSheetsClient, loadServiceAccount } from './sheets'

export const VERSION = '17.0.0'

export interface ServerOptions {
  env?: NodeJS.ProcessEnv
  port?: number
  log?: (m: string) => void
}

export async function startServer(opts: ServerOptions = {}) {
  const env = opts.env ?? process.env
  const log = opts.log ?? ((m: string) => console.log(`[taraz] ${m}`))
  const url = env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required (postgres://user:pass@host:5432/db)')
  const db = connect(url)
  await migrate(db)

  if (await isEmpty(db)) {
    const seed = env.TARAZ_SEED === 'demo' ? demoState(env.TARAZ_DEMO_PASSWORD || undefined) : (() => {
      const username = (env.TARAZ_ADMIN_USERNAME ?? '').trim().toLowerCase()
      const password = env.TARAZ_ADMIN_PASSWORD ?? ''
      if (!/^[a-z0-9._-]{3,24}$/.test(username) || password.length < 8) throw new Error('Empty database: set TARAZ_ADMIN_USERNAME and TARAZ_ADMIN_PASSWORD (8+ characters) for the CEO account, or TARAZ_SEED=demo for sample data.')
      return productionState({ username, password, name: env.TARAZ_ADMIN_NAME?.trim() || 'مدیرعامل' })
    })()
    log(`empty database: writing the ${env.TARAZ_SEED === 'demo' ? 'sample' : 'initial'} state`)
    await tx(db, async (c) => {
      await writeChanges(c, diffData(null, seed.state))
      for (const p of seed.passwords) await setPassword(c, p.userId, p.password)
      await setMeta(c, 'createdAt', new Date().toISOString())
    })
  }

  const data = await loadData(db)
  const state: State = { ...data, session: null, persianDigits: true, nav: { page: 'home' }, openTaskId: null, profileUserId: null, theme: 'system', profileTab: 'profile', denial: null }
  // ids made by this process never collide with ids of an earlier run
  setIdBase(`${Date.now().toString(36)}-`)
  refreshToday()
  const core = new Core(db, state)
  // a run cut short by a restart would otherwise look busy forever
  if (state.syncRuns.some((r) => r.state === 'running')) {
    await core.exclusive(() => core.commit({ ...core.state, syncRuns: core.state.syncRuns.map((r) => (r.state === 'running' ? { ...r, state: 'failed', log: [...r.log, { level: 'error', text: 'سرور در میانه‌ی این اجرا دوباره راه‌اندازی شد؛ اجرا ناتمام ماند.' }] } : r)) }))
  }

  const sa = loadServiceAccount(env)
  const sheets = sa ? createSheetsClient(sa, { apiBase: env.SHEETS_API_BASE, tokenUrl: env.GOOGLE_TOKEN_URL }) : null
  if (!sheets) log('Google service account not set: Sync and Write-back will report it until GOOGLE_SERVICE_ACCOUNT_FILE is configured')
  const syncEveryHours = Number(env.TARAZ_SYNC_EVERY_HOURS ?? 2)
  const writebackDelaySec = Number(env.TARAZ_WRITEBACK_DELAY_SEC ?? 120)
  const schedule = env.TARAZ_SYNC_SCHEDULE !== 'off'
  const [h0, h1] = (env.TARAZ_SYNC_HOURS ?? '8-19').split('-').map(Number)
  const jobs = new Jobs(core, sheets, { writebackDelaySec, syncEveryHours, schedule, hours: [h0, h1], log })
  jobs.start()

  const staticDir = env.TARAZ_STATIC_DIR ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../web-dist')
  const app = createApp({
    core, jobs, db, staticDir: existsSync(path.join(staticDir, 'index.html')) ? staticDir : null,
    secureCookies: env.TARAZ_COOKIE_SECURE ? env.TARAZ_COOKIE_SECURE === '1' : false,
    syncEveryHours, writebackDelaySec, schedule, version: VERSION,
  })
  const server = createServer((req, res) => { void app(req, res) })
  server.keepAliveTimeout = 65_000
  const port = opts.port ?? Number(env.PORT ?? 8080)
  await new Promise<void>((res) => server.listen(port, env.HOST ?? '0.0.0.0', () => res()))
  const address = server.address()
  const actualPort = typeof address === 'object' && address ? address.port : port
  log(`listening on :${actualPort} (${core.state.users.length} users, ${Object.keys(core.state.tasks).length} tasks)`)
  return {
    port: actualPort, core, jobs, db,
    async close() {
      jobs.stop()
      server.closeAllConnections?.()
      await new Promise<void>((res) => server.close(() => res()))
      await db.end()
    },
  }
}

const isMain = process.argv[1] && /main\.(mjs|ts|js)$/.test(process.argv[1])
if (isMain) {
  startServer().catch((e) => { console.error(`[taraz] ${e instanceof Error ? e.message : e}`); process.exit(1) })
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(0))
}
