// The jobs the server runs by itself: Sync with each project's MDR (on demand and every few hours on workdays) and
// the delayed Write-back of Last Status Date / Last Status / Progress after Status changes.
import { isOffDay } from '../src/lib/admin'
import { a1Tab, colLetter, diffMdr, jalaliCell, MdrError, parseMdr, planWriteBack, sheetIdOf, todoStatusFor, type WriteBackRequest } from '../src/lib/mdrSync'
import { refreshToday, TODAY } from '../src/lib/seed'
import { reducer, type State } from '../src/lib/state'
import type { Project, SyncRun, WriteBackItem } from '../src/lib/types'
import type { Core } from './core'
import { getMeta, setMeta } from './db'
import { SheetsError, type SheetsClient } from './sheets'

export interface JobOptions {
  writebackDelaySec: number
  syncEveryHours: number
  /** scheduled Sync on/off */
  schedule: boolean
  /** working hours (Tehran) of the scheduled Sync */
  hours: [number, number]
  log?: (msg: string) => void
}

type Log = SyncRun['log']
const isNote = (w: string) => w.startsWith('Weight فقط برای')
const tehranHour = (d = new Date()) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', hour12: false }).format(d)) % 24
const errText = (e: unknown) => (e instanceof SheetsError || e instanceof MdrError ? e.message : `خطای داخلی: ${(e as Error)?.message ?? e}`)

export class Jobs {
  private wbTimer: NodeJS.Timeout | null = null
  private wbRetry = new Map<string, { n: number; at: number }>()
  private wbRunning = false
  private syncing = new Set<string>()
  private ticker: NodeJS.Timeout | null = null
  private n = 0

  private core: Core
  private sheets: SheetsClient | null
  private opt: JobOptions
  constructor(core: Core, sheets: SheetsClient | null, opt: JobOptions) {
    this.core = core; this.sheets = sheets; this.opt = opt
    core.subscribe(() => this.armWriteBack())
  }

  get googleEmail() { return this.sheets?.email ?? null }
  private id(p: string) { return `${p}-${Date.now().toString(36)}-${(this.n++).toString(36)}` }
  private log(m: string) { this.opt.log?.(m) }

  start() {
    this.armWriteBack()
    this.ticker = setInterval(() => { void this.tick() }, 60_000)
    this.ticker.unref?.()
  }
  stop() {
    if (this.ticker) clearInterval(this.ticker)
    if (this.wbTimer) clearTimeout(this.wbTimer)
  }

  /** Every minute: roll "today" over at midnight (Tehran), run the scheduled Sync when it is due */
  async tick(now = new Date()) {
    refreshToday(now)
    if (!this.opt.schedule || !this.sheets) return
    const s = this.core.state
    if (isOffDay(TODAY, new Set(s.holidays.map((h) => h.date)))) return
    const h = tehranHour(now)
    if (h < this.opt.hours[0] || h >= this.opt.hours[1]) return
    const last = (await getMeta<number>(this.core.db, 'lastScheduledSync')) ?? 0
    if (now.getTime() - last < this.opt.syncEveryHours * 3600_000 - 60_000) return
    await setMeta(this.core.db, 'lastScheduledSync', now.getTime())
    this.log('scheduled Sync of every project')
    await this.syncAll('scheduled')
  }

  // ---------- Sync ----------
  async syncAll(trigger: 'manual' | 'scheduled', by?: string) {
    const runs: SyncRun[] = []
    for (const p of this.core.state.projects.filter((x) => x.mdrUrl)) runs.push(await this.syncProject(p.id, trigger, by))
    return runs
  }

  /** Reads the project's MDR, compares it with the project's tasks and puts every difference in Sync Review */
  async syncProject(projectId: string, trigger: 'manual' | 'scheduled', by?: string): Promise<SyncRun> {
    const p = this.core.state.projects.find((x) => x.id === projectId)
    if (!p) throw new Error('project not found')
    // one Sync per project at a time: a second request gets the run already in progress
    if (this.syncing.has(projectId)) return this.core.state.syncRuns.find((r) => r.projectId === projectId && r.state === 'running') ?? this.core.state.syncRuns[0]
    this.syncing.add(projectId)
    const started = Date.now()
    const run: SyncRun = { id: this.id('run'), projectId, trigger, at: new Date().toISOString(), durationSec: 0, state: 'running', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [{ level: 'info', text: `خواندن MDR (Tab «${p.mdrTab}») از Google Sheets…` }] }
    try {
      await this.core.dispatch(null, { type: 'sysRunStart', run })
      let values: string[][] | null = null
      let failure: string | null = null
      try { values = await this.read(p) } catch (e) { failure = errText(e) }
      return await this.core.exclusive(async () => {
        const state = this.core.state
        const dur = () => Math.max(1, Math.round((Date.now() - started) / 1000))
        let next: State
        if (failure || !values) {
          next = reducer({ ...state, session: null }, {
            type: 'sysSyncResult', projectId, runId: run.id, at: new Date().toISOString(), replacePending: false, items: [], refresh: [], by,
            run: { state: 'failed', durationSec: dur(), log: [...run.log, { level: 'error', text: failure ?? 'MDR خوانده نشد.' }] },
          })
        } else {
          let sheet
          try { sheet = parseMdr(values) } catch (e) {
            next = reducer({ ...state, session: null }, {
              type: 'sysSyncResult', projectId, runId: run.id, at: new Date().toISOString(), replacePending: false, items: [], refresh: [], by,
              run: { state: 'failed', durationSec: dur(), rowsRead: values.length, log: [...run.log, { level: 'error', text: errText(e) }] },
            })
            await this.core.commit(next)
            return this.core.state.syncRuns.find((r) => r.id === run.id)!
          }
          let i = 0
          const d = diffMdr({ projectId, tasks: state.tasks, sheet, runId: run.id, todoStatusId: todoStatusFor(state, projectId), previous: state.syncItems.filter((x) => x.projectId === projectId), newItemId: () => `${run.id}-${i++}` })
          const problems = sheet.rows.flatMap((r) => r.warnings.filter((w) => !isNote(w)).map((w) => `ردیف ${r.row}: ${w}`))
          const split = new Set(sheet.rows.filter((r) => r.warnings.some(isNote)).map((r) => r.parentKey)).size
          const c = sheet.columns
          const log: Log = [
            { level: 'info', text: `${sheet.rowsRead} سطر داده از Tab «${p.mdrTab}» خوانده شد (ردیف ${sheet.headerRow + 1} تا ${sheet.lastDataRow})${sheet.title ? `؛ پروژه‌ی MDR: ${sheet.title}` : ''}.` },
            { level: 'info', text: `ستون‌ها با نام هدر سطر ${sheet.headerRow} پیدا شدند؛ Write-back فقط در ستون‌های ${colLetter(c.lastDate!)}، ${colLetter(c.lastStatus!)} و ${colLetter(c.progress!)} (internal).` },
            ...sheet.warnings.map((w) => ({ level: 'warn' as const, text: w })),
            ...problems.slice(0, 40).map((w) => ({ level: 'warn' as const, text: w })),
            ...(problems.length > 40 ? [{ level: 'warn' as const, text: `و ${problems.length - 40} هشدار سطری دیگر (در خود ردیف‌های Sync Review).` }] : []),
            ...(split ? [{ level: 'info' as const, text: `${split} گروه هم‌سطح Weight کامل نداشتند؛ وزن ردیف بالادست میانشان به تساوی تقسیم شد.` }] : []),
            { level: 'info', text: `${d.items.filter((x) => x.kind === 'new').length} جدید، ${d.items.filter((x) => x.kind === 'changed').length} تغییر و ${d.items.filter((x) => x.kind === 'removed').length} حذف به صف Sync Review رفت؛ ${d.unchanged} ردیف بدون تغییر.` },
            ...(d.refresh.length ? [{ level: 'info' as const, text: `${d.refresh.length} تسک شماره‌ی ردیف، Plan Issue Date یا SubTask تازه گرفت (بدون نیاز به بررسی).` }] : []),
            ...(d.skippedRejected ? [{ level: 'info' as const, text: `${d.skippedRejected} پیشنهاد که قبلاً رد شده بود و در MDR تغییری نکرده، دوباره پیشنهاد نشد.` }] : []),
          ]
          const diffs = { new: d.items.filter((x) => x.kind === 'new').length, changed: d.items.filter((x) => x.kind === 'changed').length, removed: d.items.filter((x) => x.kind === 'removed').length }
          next = reducer({ ...state, session: null }, {
            type: 'sysSyncResult', projectId, runId: run.id, at: new Date().toISOString(), replacePending: true, items: d.items, refresh: d.refresh, by,
            run: { state: problems.length ? 'partial' : 'success', durationSec: dur(), rowsRead: sheet.rowsRead, diffs, log },
          })
        }
        await this.core.commit(next)
        return this.core.state.syncRuns.find((r) => r.id === run.id)!
      })
    } catch (e) {
      // an unexpected error must not leave the run "running": it is closed as failed with the reason
      if (this.core.state.syncRuns.some((r) => r.id === run.id && r.state === 'running')) {
        await this.core.dispatch(null, {
          type: 'sysSyncResult', projectId, runId: run.id, at: new Date().toISOString(), replacePending: false, items: [], refresh: [], by,
          run: { state: 'failed', durationSec: Math.max(1, Math.round((Date.now() - started) / 1000)), log: [...run.log, { level: 'error', text: errText(e) }] },
        }).catch(() => {})
      }
      return this.core.state.syncRuns.find((r) => r.id === run.id) ?? run
    } finally {
      this.syncing.delete(projectId)
    }
  }

  private async read(p: Project) {
    if (!this.sheets) throw new SheetsError('حساب سرویس Google روی سرور تنظیم نشده است (GOOGLE_SERVICE_ACCOUNT_FILE).', 0)
    const id = sheetIdOf(p.mdrUrl)
    if (!id) throw new SheetsError('لینک MDR این پروژه لینک Google Sheet نیست.', 0)
    return this.sheets.getValues(id, a1Tab(p.mdrTab || 'MDR'))
  }

  // ---------- Write-back ----------
  /** Queue items grouped by project; items whose task can no longer be written are listed apart */
  private groups(q: WriteBackItem[]) {
    const state = this.core.state
    const by = new Map<string, WriteBackItem[]>()
    const dead: WriteBackItem[] = []
    for (const w of q) {
      const t = state.tasks[w.taskId]
      if (!t || t.removedFromMdr || !t.docNumber) { dead.push(w); continue }
      if (!by.has(t.projectId)) by.set(t.projectId, [])
      by.get(t.projectId)!.push(w)
    }
    return { by, dead }
  }
  /** A project's items are due 2 minutes (by default) after its last change, or at its next retry after a failure */
  private dueAt(projectId: string, list: WriteBackItem[]) {
    return Math.max(Math.max(...list.map((w) => w.queuedAt)) + this.opt.writebackDelaySec * 1000, this.wbRetry.get(projectId)?.at ?? 0)
  }
  private armWriteBack() {
    if (this.wbTimer) { clearTimeout(this.wbTimer); this.wbTimer = null }
    const { by, dead } = this.groups(this.core.state.writeQueue)
    if (!by.size && !dead.length) return
    const due = Math.min(...[...by].map(([pid, list]) => this.dueAt(pid, list)), dead.length ? Date.now() : Infinity)
    this.wbTimer = setTimeout(() => { void this.flushWriteBack() }, Math.max(0, due - Date.now()) + 50)
    this.wbTimer.unref?.()
  }

  /** Writes the due part of the queue (all of it when forced). One project's failure never holds back another's. */
  async flushWriteBack(force = false): Promise<SyncRun[]> {
    if (this.wbRunning) return []
    this.wbRunning = true
    try {
      const state = this.core.state
      const { by, dead } = this.groups(state.writeQueue)
      const settled: { taskId: string; queuedAt: number }[] = [...dead]
      const runs: SyncRun[] = []
      const rows: { taskId: string; mdrRow: number }[] = []
      for (const [pid, list] of by) {
        if (!force && Date.now() < this.dueAt(pid, list)) continue
        const p = state.projects.find((x) => x.id === pid)
        const started = Date.now()
        const run: SyncRun = { id: this.id('run-wb'), projectId: pid, trigger: 'writeback', at: new Date().toISOString(), durationSec: 0, state: 'success', rowsRead: 0, diffs: { new: 0, changed: 0, removed: 0 }, cellsWritten: 0, log: [] }
        if (!p || !sheetIdOf(p.mdrUrl)) {
          // nothing to write to: the queue would never empty, so these items are closed with a clear record
          run.state = 'failed'
          run.log.push({ level: 'error', text: 'لینک MDR این پروژه ثبت نشده است؛ Status این سندها در MDR نوشته نشد.' }, { level: 'info', text: `${list.length} سند از صف Write-back خارج شد. پس از ثبت لینک MDR، تغییر بعدی Status نوشته می‌شود.` })
          settled.push(...list)
          runs.push(run)
          continue
        }
        try {
          const values = await this.read(p)
          const sheet = parseMdr(values)
          const reqs: WriteBackRequest[] = list.map((w) => ({ task: state.tasks[w.taskId], statusName: w.statusName, progress: w.progress, date: w.date }))
          const plan = planWriteBack(sheet, p.mdrTab || 'MDR', reqs)
          const id = sheetIdOf(p.mdrUrl)!
          const n1 = await this.sheets!.batchUpdate(id, 'RAW', plan.raw)
          const n2 = await this.sheets!.batchUpdate(id, 'USER_ENTERED', plan.entered)
          run.rowsRead = sheet.rowsRead
          run.cellsWritten = n1 + n2
          run.log.push({ level: 'info', text: `${list.length} سند: ردیف هر سند پیش از نوشتن با Document Number از MDR دوباره پیدا شد.` })
          for (const f of plan.found) run.log.push({ level: 'info', text: `${f.req.task.docNumber} ← ردیف ${f.row}: Last Status «${f.req.statusName}»، Progress ${Math.round(f.req.progress)}٪، Last Status Date ${jalaliCell(f.req.date)}` })
          for (const m of plan.missing) run.log.push({ level: 'warn', text: `«${m.task.name}» (${m.task.docNumber}) در MDR پیدا نشد؛ Status آن نوشته نشد.` })
          run.log.push({ level: 'info', text: `فقط ۳ ستون internal نوشته شد — ${run.cellsWritten} سلول. هیچ سلول دیگری تغییر نکرد.` })
          run.state = plan.missing.length ? 'partial' : 'success'
          for (const f of plan.found) rows.push({ taskId: f.req.task.id, mdrRow: f.row })
          settled.push(...list)
          this.wbRetry.delete(pid)
        } catch (e) {
          const r = this.wbRetry.get(pid) ?? { n: 0, at: 0 }
          r.n++
          r.at = Date.now() + Math.min(60, 5 * 2 ** (r.n - 1)) * 60_000
          this.wbRetry.set(pid, r)
          run.state = 'failed'
          run.log.push({ level: 'error', text: errText(e) }, { level: 'info', text: `${list.length} سند در صف ماند؛ ${Math.round((r.at - Date.now()) / 60_000)} دقیقه‌ی دیگر دوباره امتحان می‌شود.` })
          // a failure that keeps repeating is recorded once an hour, not on every retry
          if (r.n > 1 && r.n % 4 !== 0 && !force) { run.durationSec = -1 }
        }
        run.durationSec = run.durationSec < 0 ? -1 : Math.max(1, Math.round((Date.now() - started) / 1000))
        runs.push(run)
      }
      const shown = runs.filter((r) => r.durationSec >= 0)
      if (settled.length || shown.length) await this.core.dispatch(null, { type: 'sysWriteBack', runs: shown, settled, rows })
      return runs
    } finally {
      this.wbRunning = false
      this.armWriteBack()
    }
  }
}
