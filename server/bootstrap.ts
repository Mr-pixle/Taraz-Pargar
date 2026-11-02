// The first state of a new database: either the office's real starting point (teams, Status Set, rules and one CEO
// account from the environment) or, for trials, the full sample data of the browser version.
import { DEFAULT_TIMESHEET_CONFIG } from '../src/lib/admin'
import { DEFAULT_POINT_CONFIG } from '../src/lib/points'
import { DEMO_PASSWORD, OFFICE_STATUSES, TEAMS } from '../src/lib/seed'
import { fromJalali } from '../src/lib/jalali'
import { initialState, type State } from '../src/lib/state'
import type { User } from '../src/lib/types'

export interface BootstrapResult { state: State; passwords: { userId: string; password: string }[] }

export function demoState(password = DEMO_PASSWORD): BootstrapResult {
  const s = initialState()
  const users = s.users.map(({ password: _p, ...u }) => u as User)
  return { state: { ...s, users }, passwords: users.map((u) => ({ userId: u.id, password })) }
}

export function productionState(admin: { username: string; password: string; name: string }): BootstrapResult {
  const at = new Date().toISOString()
  const ceo: User = { id: 'u-ceo', name: admin.name, username: admin.username, teamId: 'mgt', role: 'ceo', capacity: 8, title: 'مدیرعامل', status: 'active', createdAt: at }
  const state: State = {
    projects: [], tasks: {}, allocations: [], leaves: [], syncItems: [], syncRuns: [], audit: [], writeQueue: [],
    comments: [], messages: [], notifications: [], lastRead: {}, internalProjects: [], reviewRounds: [], attachments: [],
    pointEntries: [], workLogs: [], adminRequests: [], timesheets: {}, monthCloses: [], personalTasks: {}, personalBoards: {},
    session: null, persianDigits: true, nav: { page: 'home' }, openTaskId: null, profileUserId: null, theme: 'system', profileTab: 'profile', denial: null,
    teams: TEAMS.map((t) => ({ ...t })),
    users: [ceo],
    statusSets: { office: OFFICE_STATUSES.map((x) => ({ ...x })) },
    // the fixed (solar) official holidays; the lunar ones are added by Project Control each year
    holidays: [
      { id: 'h-1405-11-22', date: fromJalali(1405, 11, 22), title: 'پیروزی انقلاب اسلامی' },
      { id: 'h-1405-12-29', date: fromJalali(1405, 12, 29), title: 'ملی شدن صنعت نفت' },
      ...[1, 2, 3, 4].map((d) => ({ id: `h-1406-01-0${d}`, date: fromJalali(1406, 1, d), title: 'نوروز' })),
      { id: 'h-1406-01-12', date: fromJalali(1406, 1, 12), title: 'روز جمهوری اسلامی' },
      { id: 'h-1406-01-13', date: fromJalali(1406, 1, 13), title: 'روز طبیعت' },
    ],
    pointConfigs: [{ ...DEFAULT_POINT_CONFIG, by: ceo.id, at }],
    timesheetConfigs: [{ ...DEFAULT_TIMESHEET_CONFIG, by: ceo.id, at }],
  }
  return { state, passwords: [{ userId: ceo.id, password: admin.password }] }
}
