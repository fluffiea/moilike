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
  fromName: string
}

export type BindRequest = { id: string; name: string; avatarUrl: string; createdAtMs: number }

export type Page<T> = { items: T[]; nextCursor: string }

type UserResult = { user: User }

/** 路由 → [请求参数, 响应数据] */
export interface Routes {
  'home.summary': [{}, { user: User | null; letters: { total: number; recent: { id: string; title: string }[] } }]
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
  'letters.remove': [{ id: string }, null]
}

export type Route = keyof Routes
export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
