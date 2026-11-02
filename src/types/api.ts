/** 与 cloudfunctions/api 返回结构一一对应 */

export type Media = { id: string; thumb: string; url: string }
export type Person = { name: string; avatarUrl: string }
export type ReportFilter = 'all' | 'action_needed' | 'mine'
export type ReportState = 'pending_read' | 'read' | 'evaluated'

export type Partner = {
  openId: string
  nickName: string
  signature: string
  avatarUrl: string
}

export type User = {
  openId: string
  nickName: string
  signature: string
  avatarFileId: string
  avatarUrl: string
  togetherSinceMs: number | null
  preferences: { resonanceReportFilter: ReportFilter }
  partner: Partner | null
}

export type FirstComment = { name: string; text: string }
export type CommentSummary = { commentCount: number; firstComment: FirstComment | null }

export type DailyPost = CommentSummary & {
  id: string
  isMine: boolean
  author: Person
  text: string
  images: Media[]
  createdAtMs: number
}

export type DailyComment = {
  id: string
  authorName: string
  isMine: boolean
  text: string
  parentId: string
  depth: number
  createdAtMs: number
}

export type ReportPost = {
  id: string
  isMine: boolean
  author: Person
  body: string
  tags: string[]
  images: Media[]
  recordAtMs: number
  createdAtMs: number
  state: ReportState
  evalText: string
  canMarkRead: boolean
  canEvaluate: boolean
  canEditEval: boolean
}

export type LetterItem = {
  id: string
  isMine: boolean
  title: string
  preview: string
  type: string
  thumbs: string[]
  createdAtMs: number
}

export type Letter = {
  id: string
  isMine: boolean
  title: string
  content: string
  type: string
  images: Media[]
  createdAtMs: number
  updatedAtMs: number
  /** 寄出后又改过 */
  revised: boolean
  fromName: string
}

export type BindRequest = { id: string; name: string; avatarUrl: string; createdAtMs: number }

export type Expense = {
  id: string
  amountFen: number
  l1: string
  l2: string
  l1Name: string
  l2Name: string
  note: string
  occurredAtMs: number
  createdAtMs: number
  updatedAtMs: number
}

export type ExpenseL1Stat = { l1: string; name: string; amountFen: number }
export type ExpenseL2Stat = { l2: string; name: string; amountFen: number }

export type ExpenseMonthSummary = {
  month: string
  totalFen: number
  count: number
  /** 所看月份就是当前北京时间的自然月，还没过完 */
  open: boolean
  /** 较上月；上月没有支出时为 — */
  mom: string
  /** 已结束自然月的月均，不含本月；没有任何已结束月份时为 null */
  avgFen: number | null
  top: ExpenseL1Stat[]
  categories: ExpenseL1Stat[]
  breakdown: { l1: string; name: string; totalFen: number; items: ExpenseL2Stat[] } | null
}

export type Page<T> = { items: T[]; nextCursor: string }

type UserResult = { user: User }

/** 路由 → [请求参数, 响应数据] */
export interface Routes {
  'home.summary': [{}, { user: User | null }]
  'user.me': [{}, { user: User | null }]
  'user.saveProfile': [{ nickName: string; avatarFileId: string; signature?: string }, UserResult]
  'user.savePreferences': [{ preferences: { resonanceReportFilter: ReportFilter } }, UserResult]
  'user.setTogetherSince': [{ togetherSinceMs: number }, UserResult]
  'user.partnerPanel': [{}, { user: User; bindCode: string; inbound: BindRequest[]; outbound: BindRequest | null }]
  'user.requestBind': [{ bindCode: string }, null]
  'user.respondBind': [{ requestId: string; accept: boolean }, UserResult]

  'daily.list': [{ cursor?: string; dayStartMs?: number }, Page<DailyPost>]
  'daily.get': [{ id: string }, { post: DailyPost; comments: DailyComment[] }]
  'daily.create': [{ text: string; images: string[] }, { post: DailyPost }]
  'daily.update': [{ id: string; text: string; images: string[] }, { post: DailyPost }]
  'daily.remove': [{ id: string }, null]
  'daily.addComment': [{ postId: string; text: string; parentId?: string }, { comment: DailyComment; summary: CommentSummary }]
  'daily.updateComment': [{ postId: string; commentId: string; text: string }, { comment: DailyComment; summary: CommentSummary }]
  'daily.removeComment': [{ postId: string; commentId: string }, { summary: CommentSummary }]

  'report.list': [{ filter: ReportFilter; cursor?: string }, Page<ReportPost>]
  'report.get': [{ id: string }, { post: ReportPost }]
  'report.create': [{ body: string; images: string[]; tags: string[]; recordAtMs: number }, { post: ReportPost }]
  'report.update': [{ id: string; body: string; images: string[]; tags: string[]; recordAtMs: number }, { post: ReportPost }]
  'report.remove': [{ id: string }, null]
  'report.markRead': [{ id: string }, { post: ReportPost }]
  'report.evaluate': [{ id: string; text: string }, { post: ReportPost }]
  'report.tags': [{}, { tags: string[] }]
  'report.addTag': [{ tag: string }, { tags: string[] }]
  'report.removeTag': [{ tag: string }, { tags: string[] }]

  'letters.list': [{ cursor?: string }, Page<LetterItem>]
  'letters.get': [{ id: string }, { letter: Letter }]
  'letters.create': [{ title: string; content: string; type: string; images: string[] }, { letter: Letter }]
  'letters.update': [{ id: string; title: string; content: string; type: string; images: string[] }, { letter: Letter }]
  'letters.remove': [{ id: string }, null]

  'expense.list': [{ month: string; cursor?: string; l1?: string }, Page<Expense>]
  'expense.get': [{ id: string }, { expense: Expense }]
  'expense.create': [{ amountFen: number; l1: string; l2: string; note?: string; occurredAtMs: number }, { expense: Expense }]
  'expense.update': [{ id: string; amountFen: number; l1: string; l2: string; note?: string; occurredAtMs: number }, { expense: Expense }]
  'expense.remove': [{ id: string }, null]
  /** scope=total 只返回本月合计，给独白入口用，不算环比和月均 */
  'expense.monthSummary': [{ month: string; l1?: string; scope?: 'total' | 'full' }, ExpenseMonthSummary]
}

export type Route = keyof Routes
export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
