/** 与 cloudfunctions/api 返回结构一一对应 */

export type Media = { id: string; thumb: string; url: string }
export type Person = { name: string; avatarUrl: string }
export type ReportFilter = 'all' | 'await_me' | 'mine'
export type ReportState = 'awaiting_response' | 'responded'
/** 我的账单对对方开放到哪一步 */
export type LedgerScope = 'none' | 'summary' | 'detail'
export type LedgerView = 'mine' | 'partner'

export type Partner = {
  openId: string
  nickName: string
  signature: string
  avatarUrl: string
  /** 对方把账单开放到哪一步。旧缓存可能没有；没有时记账页先按未开放 */
  ledgerScope?: LedgerScope
}

export type User = {
  openId: string
  nickName: string
  signature: string
  avatarFileId: string
  avatarUrl: string
  togetherSinceMs: number | null
  preferences: { resonanceReportFilter: ReportFilter }
  /** 对方能看到我的账单到什么程度；双方各自一份 */
  ledgerVisibility: { scope: LedgerScope }
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
  /** awaiting_response：还没贴纸；responded：已贴或旧数据已有文字评价 */
  state: ReportState
  /** 对方打开详情的时间；0 表示还没打开 */
  partnerOpenedAt: number
  /** 对方最新贴纸；空串表示还没贴 */
  partnerStickerId: string
  /** 最近一次回心时间；0 表示还没回 */
  partnerRespondedAt: number
  /** 对方可以贴或改贴 */
  canRespond: boolean
}

export type ReportList = Page<ReportPost> & { awaitMeCount: number }

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
  /** 是不是当前用户自己记的 */
  mine: boolean
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
} & ExpenseAccess

export type ExpenseAccess = {
  view: LedgerView
  /** 对方对我开放的范围；看自己的账时为 detail */
  scope: LedgerScope
  /** 合计是否计入了对方的金额 */
  includesPartner: boolean
}

export type ExpenseList = Page<Expense> & ExpenseAccess

export type Page<T> = { items: T[]; nextCursor: string }

type UserResult = { user: User }

/** 路由 → [请求参数, 响应数据] */
export interface Routes {
  'home.summary': [{}, { user: User | null; awaitMeCount: number }]
  'user.me': [{}, { user: User | null }]
  'user.saveProfile': [{ nickName: string; avatarFileId: string; signature?: string }, UserResult]
  'user.savePreferences': [{ preferences: { resonanceReportFilter: ReportFilter } }, UserResult]
  'user.saveLedgerVisibility': [{ scope: LedgerScope }, UserResult]
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

  'report.list': [{ filter: ReportFilter; cursor?: string }, ReportList]
  'report.get': [{ id: string }, { post: ReportPost }]
  'report.create': [{ body: string; images: string[]; tags: string[]; recordAtMs: number }, { post: ReportPost }]
  'report.update': [{ id: string; body: string; images: string[]; tags: string[]; recordAtMs: number }, { post: ReportPost }]
  'report.remove': [{ id: string }, null]
  'report.open': [{ id: string }, { post: ReportPost }]
  'report.respond': [{ id: string; stickerId: string }, { post: ReportPost; awaitMeCount: number }]
  'report.tags': [{}, { tags: string[] }]
  'report.addTag': [{ tag: string }, { tags: string[] }]
  'report.removeTag': [{ tag: string }, { tags: string[] }]

  'letters.list': [{ cursor?: string }, Page<LetterItem>]
  'letters.get': [{ id: string }, { letter: Letter }]
  'letters.create': [{ title: string; content: string; type: string; images: string[] }, { letter: Letter }]
  'letters.update': [{ id: string; title: string; content: string; type: string; images: string[] }, { letter: Letter }]
  'letters.remove': [{ id: string }, null]

  'expense.list': [{ month: string; cursor?: string; l1?: string; view?: LedgerView }, ExpenseList]
  'expense.get': [{ id: string }, { expense: Expense }]
  'expense.create': [{ amountFen: number; l1: string; l2: string; note?: string; occurredAtMs: number }, { expense: Expense }]
  'expense.update': [{ id: string; amountFen: number; l1: string; l2: string; note?: string; occurredAtMs: number }, { expense: Expense }]
  'expense.remove': [{ id: string }, null]
  /** scope=total 只返回本月合计，给独白入口用，不算环比和月均。view 决定看谁的账，缺省 mine */
  'expense.monthSummary': [{ month: string; l1?: string; scope?: 'total' | 'full'; view?: LedgerView }, ExpenseMonthSummary]

  'kitchen.mine': [{}, { kitchen: Kitchen | null; pendingCount: number }]
  'kitchen.create': [{ name: string }, { kitchen: Kitchen }]
  'kitchen.rename': [{ name: string }, { kitchen: Kitchen }]
  'kitchen.categories': [{}, { categories: KitchenCategory[] }]
  'kitchen.createCategory': [{ name: string }, { category: KitchenCategory }]
  'kitchen.renameCategory': [{ id: string; name: string }, { category: KitchenCategory }]
  'kitchen.removeCategory': [{ id: string }, null]
  /** 厨方菜单一屏：厨房名、分类（含空分类和道数）、全部菜品 */
  'kitchen.dishes': [{}, { kitchen: Kitchen; categories: KitchenCategory[]; dishes: KitchenDish[] }]
  'kitchen.dish': [{ id: string }, { dish: KitchenDish }]
  'kitchen.createDish': [DishWrite, { dish: KitchenDish }]
  'kitchen.updateDish': [DishWrite & { id: string }, { dish: KitchenDish }]
  'kitchen.removeDish': [{ id: string }, null]
  'kitchen.partner': [{}, PartnerMenu]
  'kitchen.orderCreate': [{ items: OrderDraft[]; note?: string }, { order: MyOrder }]
  'kitchen.myOrders': [{ cursor?: string }, Page<MyOrder>]
  'kitchen.cancel': [{ id: string }, { order: MyOrder }]
  'kitchen.ops': [{ status: OpsStatus; cursor?: string }, Page<OpsOrder>]
  'kitchen.accept': [{ id: string }, { order: OpsOrder }]
  'kitchen.complete': [{ id: string }, { order: OpsOrder }]
}

export type Kitchen = { id: string; name: string; createdAtMs: number }

export type KitchenCategory = { id: string; name: string; dishCount: number; createdAtMs: number }

export type DishCover = { id: string; thumb: string; url: string }

export type KitchenDish = {
  id: string
  categoryId: string
  categoryName: string
  name: string
  desc: string
  cover: DishCover | null
  onShelf: boolean
  createdAtMs: number
}

export type DishWrite = {
  name: string
  categoryId?: string
  newCategoryName?: string
  desc?: string
  coverFileId?: string
  onShelf?: boolean
}

export type MenuScene = 'unpaired' | 'no_kitchen' | 'empty' | 'menu'

export type MenuDish = {
  id: string
  categoryId: string
  name: string
  desc: string
  cover: DishCover | null
  /** 出现在已完成订单里的次数；同一单多份只计 1，未完成和已取消不计 */
  doneCount: number
  /** 无记录为空串；满 5 次为「常点」，否则「我们点过 N 次」 */
  salesLabel: string
}

export type PartnerMenu = {
  scene: MenuScene
  kitchen: { id: string; name: string } | null
  categories: { id: string; name: string }[]
  dishes: MenuDish[]
}

export type OrderStatus = 'pending' | 'in_progress' | 'done' | 'cancelled'
export type OpsStatus = 'pending' | 'in_progress' | 'done'

export type OrderLine = { dishId: string; name: string; quantity: number }
export type OrderDraft = { dishId: string; quantity: number }

export type MyOrder = {
  id: string
  status: OrderStatus
  statusLabel: string
  note: string
  lines: OrderLine[]
  createdAtMs: number
  canCancel: boolean
  canReorder: boolean
}

export type OpsOrder = {
  id: string
  status: OrderStatus
  statusLabel: string
  ordererName: string
  ordererAvatar: string
  names: string
  lines: OrderLine[]
  note: string
  createdAtMs: number
  canAccept: boolean
  canComplete: boolean
}

export type Route = keyof Routes
export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }
