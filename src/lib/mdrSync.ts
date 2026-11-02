// MDR ⇄ Taraz: reads the office's fixed MDR template (Google Sheet, tab "MDR") and turns it into Sync Review items,
// and computes the three internal cells written back after a Status change. Pure — shared by the server and the tests.
//
// The template (same in every project, e.g. Babolsar 458, Darrous 386, Nourian 320):
//   row 1  project name (column "Sheets Name") and building type
//   row 2  headers: Project | Project Code | Document Number | phase | Stage | summary | Docs | Sheets Name |
//          Parent 4 | P4 | Parent 3 | P3 | Parent 2 | P2 | Parent 1 | SubTask (Render) | SubTask (Design) | Floor | Weight | Package |
//          To Clickup / To Jira | Transmital | Plan Issue Date | … | Serial Number | … |
//          Last Status Date (internal) | Last Status (internal) | Progress (internal) | Name | …
//   row 3… one row per level; the filled column says the level:
//          phase → Phase · Stage → Stage · summary → Group · Docs → Doc type · Document Number + Sheets Name → Document
// Columns are found by header name, never by letter, so inserted columns do not break the Sync.
import { fromJalali, toJalali } from './jalali'
import { statusesFor } from './domain'
import type { State } from './state'
import type { FieldChange, MdrRefresh, SyncItem, Task, TaskKind } from './types'

export type MdrLevel = 'phase' | 'stage' | 'group' | 'doctype' | 'document'
const LEVEL_KIND: Record<MdrLevel, TaskKind> = { phase: 'phase', stage: 'stage', group: 'group', doctype: 'doctype', document: 'document' }
const DEPTH: Record<MdrLevel, number> = { phase: 0, stage: 1, group: 2, doctype: 3, document: 4 }
export const LEVEL_FA: Record<MdrLevel, string> = { phase: 'Phase', stage: 'Stage', group: 'summary', doctype: 'Docs', document: 'سند' }

/** Header names (normalised) of the columns the Sync reads or writes */
export const MDR_HEADERS = {
  docNumber: 'document number', phase: 'phase', stage: 'stage', summary: 'summary', docs: 'docs', sheet: 'sheets name',
  parent4: 'parent 4', parent3: 'parent 3', parent2: 'parent 2', parent1: 'parent 1',
  subRender: 'subtask (render)', subDesign: 'subtask (design)', floor: 'floor', weight: 'weight', pkg: 'package',
  planIssue: 'plan issue date', serial: 'serial number',
  lastDate: 'last status date (internal)', lastStatus: 'last status (internal)', progress: 'progress (internal)',
} as const
export type MdrColumn = keyof typeof MDR_HEADERS
const REQUIRED: MdrColumn[] = ['docNumber', 'phase', 'stage', 'summary', 'docs', 'sheet', 'weight', 'lastDate', 'lastStatus', 'progress']
/** The only cells Taraz ever writes */
export const WRITE_COLUMNS: MdrColumn[] = ['lastDate', 'lastStatus', 'progress']

export class MdrError extends Error {}

export interface MdrRow {
  /** 1-based row number in the sheet */
  row: number
  level: MdrLevel
  name: string
  docNumber?: string
  serial?: string
  floor?: string
  pkg?: string
  /** share of the whole project in percent (0.25% → 0.25); null when the cell is empty or not a number */
  weight: number | null
  planIssue?: string
  subtasks: string[]
  /** stable identity in this MDR (see keyOf) */
  key: string
  parentKey: string | null
  /** names of the ancestors (phase, stage, group, doc type) */
  path: string[]
  warnings: string[]
  /** effective weight after the sibling rule, and whether it was split equally */
  w?: number
  derived?: boolean
  /** internal columns as currently in the sheet */
  internal: { date: string; status: string; progress: string }
}

export interface MdrSheet {
  title: string
  buildingType: string
  headerRow: number
  /** 0-based column index of each known header */
  columns: Partial<Record<MdrColumn, number>>
  rows: MdrRow[]
  warnings: string[]
  /** rows read from the sheet (data block) */
  rowsRead: number
  lastDataRow: number
}

// ---------- small helpers ----------
const ZW = /[​-‏‪-‮⁦-⁩﻿]/g
/** For comparing names: trim, one space, case-insensitive, Arabic ي/ك → Persian ی/ک, no zero-width marks */
export const norm = (s: string | undefined | null) => String(s ?? '').replace(ZW, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase()
const cell = (r: string[] | undefined, i: number | undefined) => (r && i != null ? String(r[i] ?? '').replace(ZW, '').trim() : '')
const latinDigits = (s: string) => s.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
const isError = (s: string) => /^#(N\/A|DIV\/0!|REF!|VALUE!|NAME\?|NUM!|NULL!|ERROR!)/i.test(s)

/** "0.25%" → 0.25 · "39.00%" → 39 · "" → null · "#DIV/0!" → error */
export function parseWeight(raw: string): { value: number | null; error?: string } {
  const s = latinDigits(raw).replace(/٫/g, '.').trim()
  if (!s) return { value: null }
  if (isError(s)) return { value: null, error: `Weight خطای فرمول دارد (${s})` }
  const m = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(s.replace(/,/g, ''))
  if (!m) return { value: null, error: `Weight عدد نیست («${s}»)` }
  const v = Number(m[1])
  if (v < 0) return { value: null, error: `Weight منفی است (${s})` }
  return { value: Math.round(v * 10000) / 10000 }
}

/** "1405-02-05" or "1405/2/5" (Jalali) → ISO Gregorian date */
export function parseJalali(raw: string): string | undefined {
  const s = latinDigits(raw).trim()
  const m = /^(1[34]\d\d)[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s)
  if (!m) return undefined
  const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (jm < 1 || jm > 12 || jd < 1 || jd > 31) return undefined
  return fromJalali(jy, jm, jd)
}
/** ISO date → "1405-08-11", the form the MDR uses */
export function jalaliCell(iso: string) {
  const j = toJalali(iso)
  return `${j.jy}-${String(j.jm).padStart(2, '0')}-${String(j.jd).padStart(2, '0')}`
}

export function colLetter(i: number) {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}
/** 'MDR' → `'MDR'` for A1 ranges (quotes doubled) */
export const a1Tab = (tab: string) => `'${tab.replace(/'/g, "''")}'`

/** Spreadsheet id from an MDR link */
export function sheetIdOf(url: string): string | null {
  const m = /\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})/.exec(url)
  return m ? m[1] : null
}

/** FNV-1a, 8 hex characters: short stable ids for summary rows */
export function hash8(s: string) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ---------- parsing ----------
function findHeader(values: string[][]) {
  for (let r = 0; r < Math.min(values.length, 15); r++) {
    const names = (values[r] ?? []).map(norm)
    if (names.includes(MDR_HEADERS.docNumber) && names.includes(MDR_HEADERS.sheet)) {
      const columns: Partial<Record<MdrColumn, number>> = {}
      for (const [k, h] of Object.entries(MDR_HEADERS) as [MdrColumn, string][]) {
        const i = names.indexOf(h)
        if (i >= 0) columns[k] = i
      }
      return { row: r, columns }
    }
  }
  return null
}

const LEVELS: [MdrLevel, MdrColumn][] = [['document', 'docNumber'], ['doctype', 'docs'], ['group', 'summary'], ['stage', 'stage'], ['phase', 'phase']]

/**
 * Reads the values of the MDR tab (as the Sheets API returns them, formatted) into rows with level, parent and identity.
 * Hierarchy comes from the position of the row (the row belongs to the nearest row of the level above it);
 * the Parent 1–4 columns are only checked and a mismatch is reported as a warning.
 */
export function parseMdr(values: string[][]): MdrSheet {
  const head = findHeader(values)
  if (!head) throw new MdrError('سطر هدر MDR پیدا نشد: در ۱۵ سطر اول، سطری با «Document Number» و «Sheets Name» نیست.')
  const { columns: c } = head
  const missing = REQUIRED.filter((k) => c[k] == null)
  if (missing.length) throw new MdrError(`این ستون‌ها در سطر هدر MDR نیستند: ${missing.map((k) => MDR_HEADERS[k]).join('، ')}`)
  const title = (values[0] ?? []).find((x, i) => i === c.sheet && x) ?? (values[0] ?? []).find((x) => String(x ?? '').trim()) ?? ''
  const buildingType = cell(values[0], c.pkg) || ''
  const warnings: string[] = []
  const rows: MdrRow[] = []
  // current ancestors by depth
  const stack: (MdrRow | undefined)[] = []
  let blank = 0, lastDataRow = head.row + 1, started = false, rowsRead = 0
  for (let r = head.row + 1; r < values.length; r++) {
    const v = values[r] ?? []
    const filled = LEVELS.filter(([, col]) => cell(v, c[col]))
    const sheetName = cell(v, c.sheet)
    if (!filled.length && !sheetName) {
      if (v.some((x) => String(x ?? '').trim())) { if (started) blank = 0 }
      else blank++
      // the data block ends at the first gap of 3 empty rows; lookup tables below it are not MDR rows
      if (started && blank >= 3) break
      continue
    }
    blank = 0
    started = true
    rowsRead++
    lastDataRow = r + 1
    const w: string[] = []
    let level: MdrLevel = filled.length ? filled[0][0] : 'document'
    if (filled.length > 1) {
      const extra = filled.slice(1).map(([l]) => LEVEL_FA[l])
      w.push(`در یک سطر چند ستون سطح پر است (${[LEVEL_FA[level], ...extra].join('، ')})؛ «${LEVEL_FA[level]}» در نظر گرفته شد.`)
    }
    const docNumber = cell(v, c.docNumber)
    if (level === 'document' && !docNumber) w.push('سند بدون Document Number است؛ Status آن به MDR نوشته نمی‌شود.')
    const name = level === 'document' ? sheetName || docNumber
      : cell(v, c[level === 'doctype' ? 'docs' : level === 'group' ? 'summary' : level])
    if (level === 'document' && !sheetName) w.push('«Sheets Name» خالی است؛ Document Number به‌جای نام گذاشته شد.')
    // parent by position
    const depth = DEPTH[level]
    let parent: MdrRow | undefined
    for (let d = depth - 1; d >= 0; d--) if (stack[d]) { parent = stack[d]; break }
    if (depth > 0 && !parent) w.push(`این ${LEVEL_FA[level]} زیر هیچ ردیف بالادستی نیست.`)
    else if (parent && DEPTH[parent.level] !== depth - 1) w.push(`ردیف ${LEVEL_FA[(Object.keys(DEPTH) as MdrLevel[])[depth - 1]]} بالای این سطر نیست؛ زیر «${parent.name}» گذاشته شد.`)
    // Parent 4..1 columns: checked against the position
    const ancestors = stack.slice(0, depth)
    const pcols: MdrColumn[] = ['parent4', 'parent3', 'parent2', 'parent1']
    for (let d = 0; d < depth; d++) {
      const declared = cell(v, c[pcols[d]])
      const actual = ancestors[d]
      if (declared && actual && norm(declared) !== norm(actual.name)) w.push(`ستون ${MDR_HEADERS[pcols[d]].replace('parent', 'Parent')} «${declared}» با ردیف بالادست «${actual.name}» یکی نیست؛ جایگاه سطر ملاک است.`)
    }
    const wr = parseWeight(cell(v, c.weight))
    if (wr.error) w.push(wr.error)
    const planRaw = cell(v, c.planIssue)
    const planIssue = planRaw ? parseJalali(planRaw) : undefined
    if (planRaw && !planIssue) w.push(`Plan Issue Date «${planRaw}» تاریخ شمسی معتبر نیست.`)
    const split = (s: string) => s.split(/[,،]/).map((x) => x.trim()).filter(Boolean)
    const subtasks = [...new Set([...split(cell(v, c.subDesign)), ...split(cell(v, c.subRender))])]
    const floor = cell(v, c.floor)
    const row: MdrRow = {
      row: r + 1, level, name, docNumber: level === 'document' ? docNumber || undefined : undefined,
      serial: cell(v, c.serial) || undefined, floor: floor && !isError(floor) ? floor : undefined, pkg: cell(v, c.pkg) || undefined,
      weight: wr.value, planIssue, subtasks, key: '', parentKey: parent?.key ?? null,
      path: ancestors.filter(Boolean).map((x) => x!.name), warnings: w,
      internal: { date: cell(v, c.lastDate), status: cell(v, c.lastStatus), progress: cell(v, c.progress) },
    }
    rows.push(row)
    stack[depth] = row
    stack.length = depth + 1
  }
  if (!rows.length) throw new MdrError('MDR هیچ سطر داده‌ای ندارد.')
  assignKeys(rows, warnings)
  applyWeights(rows)
  return { title: String(title).trim(), buildingType, headerRow: head.row + 1, columns: c, rows, warnings, rowsRead, lastDataRow }
}

/**
 * Identity of each row, stable across Syncs:
 *  document  → its Document Number; when the number repeats in the MDR → number + name (and the row is flagged)
 *  phase / stage → its name under its parent
 *  summary / Docs → its Serial Number code under its parent (survives a rename), or its name when the code is empty or repeats
 */
function assignKeys(rows: MdrRow[], warnings: string[]) {
  const byKey = new Map<string, MdrRow>()
  const parentOf = new Map<MdrRow, MdrRow | undefined>()
  // positional parents again (parentKey is filled only after the parent has its key)
  const stack: MdrRow[] = []
  for (const r of rows) {
    const d = DEPTH[r.level]
    let p: MdrRow | undefined
    for (let i = d - 1; i >= 0; i--) if (stack[i]) { p = stack[i]; break }
    parentOf.set(r, p)
    stack[d] = r
    stack.length = d + 1
  }
  const docCount = new Map<string, number>()
  for (const r of rows) if (r.docNumber) docCount.set(r.docNumber, (docCount.get(r.docNumber) ?? 0) + 1)
  const dupNumbers = [...docCount].filter(([, n]) => n > 1).map(([k]) => k)
  if (dupNumbers.length) warnings.push(`${dupNumbers.length} Document Number در MDR تکراری است؛ برای این سطرها Document Number همراه نام سند شناسه است.`)
  const unique = (base: string, r: MdrRow) => {
    let k = base, i = 2
    while (byKey.has(k)) k = `${base}~${i++}`
    if (k !== base) r.warnings.push('این سطر با سطر دیگری هم‌شناسه بود (همان شماره و همان نام)؛ با شماره‌ی ردیف از هم جدا شدند.')
    byKey.set(k, r)
    return k
  }
  for (const r of rows) {
    const p = parentOf.get(r)
    const pk = p?.key ?? ''
    r.parentKey = p ? p.key : null
    if (r.level === 'document') {
      if (r.docNumber) {
        const dup = (docCount.get(r.docNumber) ?? 0) > 1
        if (dup) r.warnings.push(`Document Number «${r.docNumber}» در MDR تکراری است؛ این سطر با نامش («${r.name}») شناخته می‌شود.`)
        r.key = unique(dup ? `${r.docNumber}|${norm(r.name)}` : r.docNumber, r)
      } else r.key = unique(`${pk}/doc:${norm(r.name)}`, r)
    } else if (r.level === 'phase' || r.level === 'stage') {
      r.key = unique(`${pk}/${r.level === 'phase' ? 'ph' : 'st'}:${norm(r.name)}`, r)
    } else {
      const tag = r.level === 'group' ? 'g' : 'd'
      const bySerial = r.serial && !isError(r.serial) ? `${pk}/${tag}#${r.serial}` : ''
      r.key = unique(bySerial && !byKey.has(bySerial) ? bySerial : `${pk}/${tag}:${norm(r.name)}`, r)
    }
  }
}

/**
 * Weights in the MDR are shares of the whole project. The children of a row are weighted with their own Weight when every
 * one of them has it; when none has it, or only some have it (the template often repeats the parent's Weight on the first
 * child only), they share the parent's Weight equally — and the partial case is reported.
 */
function applyWeights(rows: MdrRow[]) {
  const kids = new Map<string, MdrRow[]>()
  for (const r of rows) {
    const k = r.parentKey ?? ''
    if (!kids.has(k)) kids.set(k, [])
    kids.get(k)!.push(r)
  }
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const visit = (parentKey: string) => {
    const list = kids.get(parentKey) ?? []
    const parent = byKey.get(parentKey)
    const set = list.filter((r) => r.weight != null).length
    if (list.length && set === list.length) for (const r of list) { r.w = r.weight!; r.derived = false }
    else if (list.length) {
      const share = Math.round(((parent?.w ?? 100) / list.length) * 10000) / 10000
      for (const r of list) {
        r.w = share; r.derived = true
        if (set) r.warnings.push(`Weight فقط برای ${set} از ${list.length} ردیف هم‌سطح پر شده است؛ وزن ردیف بالادست میان همه به تساوی تقسیم شد.`)
      }
    }
    for (const r of list) visit(r.key)
  }
  visit('')
}

// ---------- diff → Sync Review ----------
export interface DiffInput {
  projectId: string
  tasks: Record<string, Task>
  sheet: MdrSheet
  runId: string
  /** first "todo" status of the project's Status Set, for new documents */
  todoStatusId: string
  /** earlier items of this project: a rejected proposal is not proposed again while the MDR row stays the same */
  previous: SyncItem[]
  newItemId: () => string
}
export interface DiffResult {
  items: SyncItem[]
  refresh: MdrRefresh[]
  skippedRejected: number
  unchanged: number
}

const sameNum = (a: number | null | undefined, b: number | null | undefined) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-6)
export const signature = (it: Pick<SyncItem, 'kind' | 'task' | 'taskId' | 'changes'>) =>
  it.kind === 'new' ? `new|${it.task?.mdrKey ?? it.task?.id}|${norm(it.task?.name)}|${it.task?.parentId}`
    : it.kind === 'removed' ? `rm|${it.taskId}`
      : `chg|${it.taskId}|${(it.changes ?? []).map((c) => `${c.field}=${c.to}`).join(';')}`

/** Compares the MDR with the project's tasks. Nothing is applied here: new, changed and removed rows go to Sync Review. */
export function diffMdr(input: DiffInput): DiffResult {
  const { projectId, sheet } = input
  const mine = Object.values(input.tasks).filter((t) => t.projectId === projectId && t.source === 'mdr')
  const byKey = new Map<string, Task>()
  for (const t of mine) if (t.mdrKey) byKey.set(t.mdrKey, t)
  // tasks made before MDR keys existed are matched by their Document Number
  for (const t of mine) if (!t.mdrKey && t.docNumber && !byKey.has(t.docNumber)) byKey.set(t.docNumber, t)
  const taken = new Set(Object.keys(input.tasks))
  const idOf = new Map<string, string>()
  const newId = (r: MdrRow) => {
    const base = r.level === 'document' && r.docNumber && r.key === r.docNumber ? `${projectId}:${r.docNumber}` : `${projectId}:${r.level[0]}${hash8(r.key)}`
    let id = base, i = 2
    while (taken.has(id)) id = `${base}~${i++}`
    taken.add(id)
    return id
  }
  for (const r of sheet.rows) idOf.set(r.key, byKey.get(r.key)?.id ?? newId(r))
  const rejected = new Set(input.previous.filter((x) => x.state === 'rejected').map(signature))
  const items: SyncItem[] = []
  const refresh: MdrRefresh[] = []
  let skippedRejected = 0, unchanged = 0
  const push = (it: Omit<SyncItem, 'id' | 'projectId' | 'runId' | 'state'>) => {
    if (rejected.has(signature(it))) { skippedRejected++; return }
    items.push({ id: input.newItemId(), projectId, runId: input.runId, state: 'pending', ...it })
  }
  const seen = new Set<string>()
  for (const r of sheet.rows) {
    const id = idOf.get(r.key)!
    const parentId = r.parentKey ? idOf.get(r.parentKey)! : null
    const branch = r.path.slice(0, 3)
    const t = byKey.get(r.key)
    if (t) seen.add(t.id)
    if (!t || t.removedFromMdr) {
      const task: Task = {
        id, projectId, parentId, kind: LEVEL_KIND[r.level], name: r.name, order: r.row, source: 'mdr', mdrKey: r.key, mdrRow: r.row,
        weight: r.w ?? null, weightDerived: !!r.derived,
        ...(r.docNumber ? { docNumber: r.docNumber } : {}), ...(r.floor ? { floor: r.floor } : {}), ...(r.pkg ? { pkg: r.pkg } : {}),
        ...(r.planIssue ? { planIssue: r.planIssue } : {}), ...(r.subtasks.length ? { mdrSubtasks: r.subtasks } : {}),
        ...(r.level === 'document' ? { statusId: input.todoStatusId } : {}),
      }
      push({ kind: 'new', branch, row: r.row, task, warnings: [...(t?.removedFromMdr ? ['این سطر دوباره در MDR آمده است؛ با تأیید، همان تسک قبلی (با سابقه‌اش) برمی‌گردد.'] : []), ...r.warnings] })
      continue
    }
    const changes: FieldChange[] = []
    if (t.name !== r.name) changes.push({ field: 'name', from: t.name, to: r.name })
    if (!sameNum(t.weight, r.w ?? null) || !!t.weightDerived !== !!r.derived) changes.push({ field: 'weight', from: t.weight == null ? '' : String(t.weight), to: r.w == null ? '' : String(r.w), derived: !!r.derived })
    if ((t.floor ?? '') !== (r.floor ?? '') && r.level === 'document') changes.push({ field: 'floor', from: t.floor ?? '', to: r.floor ?? '' })
    if ((t.pkg ?? '') !== (r.pkg ?? '') && (r.pkg || t.pkg)) changes.push({ field: 'package', from: t.pkg ?? '', to: r.pkg ?? '' })
    if ((t.parentId ?? null) !== parentId) {
      const toName = parentId ? (input.tasks[parentId]?.name ?? sheet.rows.find((x) => idOf.get(x.key) === parentId)?.name ?? '') : '—'
      changes.push({ field: 'parent', from: t.parentId ? input.tasks[t.parentId]?.name ?? t.parentId : '—', to: toName, toParentId: parentId ?? undefined })
    }
    if (changes.length) push({ kind: 'changed', branch, row: r.row, taskId: t.id, changes, warnings: r.warnings.length ? r.warnings : undefined })
    else unchanged++
    // reference columns follow the MDR without review
    if (t.mdrRow !== r.row || (r.planIssue && t.planIssue !== r.planIssue) || (r.subtasks.length && JSON.stringify(t.mdrSubtasks ?? []) !== JSON.stringify(r.subtasks)))
      refresh.push({ taskId: t.id, mdrRow: r.row, planIssue: r.planIssue, mdrSubtasks: r.subtasks.length ? r.subtasks : undefined })
  }
  for (const t of mine) {
    if (seen.has(t.id) || t.removedFromMdr) continue
    const branch: string[] = []
    for (let p = t.parentId ? input.tasks[t.parentId] : undefined; p; p = p.parentId ? input.tasks[p.parentId] : undefined) branch.unshift(p.name)
    push({ kind: 'removed', branch: branch.slice(0, 3), row: t.mdrRow ?? 0, taskId: t.id })
  }
  // parents before children, so approving a branch creates it top-down
  items.sort((a, b) => (a.kind === b.kind ? a.row - b.row : a.kind === 'removed' ? 1 : b.kind === 'removed' ? -1 : a.row - b.row))
  return { items, refresh, skippedRejected, unchanged }
}

// ---------- write-back ----------
export interface WriteBackRequest { task: Task; statusName: string; progress: number; date: string }
export interface WriteBackPlan {
  /** RAW cells: Last Status Date and Last Status (text exactly as given) */
  raw: { range: string; values: string[][] }[]
  /** USER_ENTERED cells: Progress as "40%" so the sheet keeps it a percentage */
  entered: { range: string; values: string[][] }[]
  found: { req: WriteBackRequest; row: number }[]
  missing: WriteBackRequest[]
  cells: number
}

/**
 * Finds the current row of every document again (rows move when people insert lines) and builds the update of the three
 * internal columns only. Nothing else in the MDR is touched.
 */
export function planWriteBack(sheet: MdrSheet, tab: string, reqs: WriteBackRequest[]): WriteBackPlan {
  const rowOf = new Map<string, number>()
  for (const r of sheet.rows) if (r.level === 'document') rowOf.set(r.key, r.row)
  const byNumber = new Map<string, number[]>()
  for (const r of sheet.rows) if (r.docNumber) byNumber.set(r.docNumber, [...(byNumber.get(r.docNumber) ?? []), r.row])
  const t = a1Tab(tab)
  const L = (k: MdrColumn) => colLetter(sheet.columns[k]!)
  const plan: WriteBackPlan = { raw: [], entered: [], found: [], missing: [], cells: 0 }
  for (const q of reqs) {
    const key = q.task.mdrKey ?? q.task.docNumber ?? ''
    let row = rowOf.get(key)
    // a task from before MDR keys: its number must still point at exactly one row
    if (row == null && !q.task.mdrKey && q.task.docNumber && byNumber.get(q.task.docNumber)?.length === 1) row = byNumber.get(q.task.docNumber)![0]
    if (row == null) { plan.missing.push(q); continue }
    plan.found.push({ req: q, row })
    plan.raw.push({ range: `${t}!${L('lastDate')}${row}`, values: [[jalaliCell(q.date)]] })
    plan.raw.push({ range: `${t}!${L('lastStatus')}${row}`, values: [[q.statusName]] })
    plan.entered.push({ range: `${t}!${L('progress')}${row}`, values: [[`${Math.round(q.progress)}%`]] })
    plan.cells += 3
  }
  return plan
}

/** First "todo" status of the project's Status Set: the status of a document that just came from the MDR */
export function todoStatusFor(state: Pick<State, 'tasks' | 'statusSets'>, projectId: string) {
  const set = statusesFor(state, { id: '', projectId, parentId: null, kind: 'document', name: '', order: 0, source: 'mdr' })
  return (set.find((s) => s.category === 'todo') ?? set[0]).id
}
