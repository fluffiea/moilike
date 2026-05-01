import requireAuth from '../../behaviors/require-auth'

type MainModule = 'daily' | 'report'
type ReportFilter = 'pending' | 'all' | 'mine'

const SWIPER_INDEX = { DAILY: 0, REPORT: 1 } as const

const REPORT_FILTER_TO_INDEX: Record<ReportFilter, number> = {
  pending: 0,
  all: 1,
  mine: 2,
}

/** 首评（列表展示一条，可省略） */
type DailyFirstComment = {
  user: string
  text: string
  time?: string
}

/** 无实拍图时的清新渐变占位（品牌五色延伸，低饱和） */
type DailyPlaceholderTone = 'mist' | 'dew' | 'bloom' | 'meadow'

/** 日常帖：头像、昵称、时间、文案；实拍图为 images，无图时用渐变占位 */
type DailyItem = {
  id: string
  userName: string
  time: string
  avatarUrl?: string
  /** 无头像图时与媒体占位一致的渐变 tone */
  avatarTone?: DailyPlaceholderTone
  /** 正文，可与媒体二选一或并存 */
  snippet: string
  /** 实拍图 URL；与 placeholder* 二选一展示媒体区 */
  images: string[]
  /** 单图渐变占位 + 高度档 */
  placeholderTone?: DailyPlaceholderTone
  /** 多图渐变占位（宫格） */
  placeholderTones?: DailyPlaceholderTone[]
  /** 单图封面高度档（实拍或单块渐变） */
  imageLayout?: 'short' | 'normal' | 'tall'
  firstComment?: DailyFirstComment
}

type ReportItem = {
  id: string
  userName: string
  publishTime: string
  tag: string
  body: string
  readByMe: boolean
  isMine: boolean
  comments: { user: string; text: string }[]
}

const DAILY_MOCK: DailyItem[] = [
  {
    id: 'd1',
    userName: '对方',
    time: '04-24 22:40',
    avatarTone: 'mist',
    snippet: '今晚做了番茄炖牛腩，厨房香了一整晚。',
    images: [],
    placeholderTone: 'mist',
    imageLayout: 'tall',
    firstComment: { user: '对方', text: '想吃', time: '04-24 22:41' },
  },
  {
    id: 'd2',
    userName: '对方',
    time: '04-23 18:20',
    avatarTone: 'dew',
    snippet: '和同事约了轻食～',
    images: [],
    placeholderTones: ['dew', 'bloom'],
    firstComment: { user: '对方', text: '明天继续', time: '04-23 19:02' },
  },
  {
    id: 'd3',
    userName: '我',
    time: '04-20 10:00',
    avatarTone: 'bloom',
    snippet:
      '今天也要好好吃饭，记得喝水、拉伸一下肩颈。晚上想早点睡，把闹钟往前调了十五分钟。',
    images: [],
    firstComment: { user: '我', text: '记下', time: '04-20 10:01' },
  },
  {
    id: 'd4',
    userName: '萌萌',
    time: '04-19 16:08',
    avatarTone: 'meadow',
    snippet: '',
    images: [],
    placeholderTone: 'meadow',
    imageLayout: 'short',
    firstComment: { user: '萌萌', text: 'OK', time: '04-19 16:09' },
  },
  {
    id: 'd5',
    userName: '我',
    time: '04-18 09:30',
    avatarTone: 'bloom',
    snippet:
      '周末去公园走了走，风很舒服。拍了几张落叶，回头整理成小相册。顺便在便利店买了热饮。',
    images: [],
    placeholderTone: 'bloom',
    imageLayout: 'normal',
    firstComment: { user: '对方', text: '羡慕', time: '04-18 10:02' },
  },
]

const REPORT_MOCK: ReportItem[] = [
  {
    id: 'r1',
    userName: '我',
    publishTime: '04-23 23:44',
    tag: '干饭222',
    body: '哈哈哈哈',
    readByMe: true,
    isMine: true,
    comments: [{ user: '萌萌', text: 'hchchh' }],
  },
  {
    id: 'r2',
    userName: '我',
    publishTime: '04-22 12:10',
    tag: '外出',
    body: '中午和同事出去干饭，大概 1h 回来',
    readByMe: false,
    isMine: true,
    comments: [{ user: '我', text: '收到' }],
  },
  {
    id: 'r3',
    userName: '萌萌',
    publishTime: '04-21 09:00',
    tag: '报备',
    body: '今日行程已更新',
    readByMe: false,
    isMine: false,
    comments: [],
  },
]

function filterReports(list: ReportItem[], f: ReportFilter): ReportItem[] {
  if (f === 'pending') return list.filter((x) => !x.readByMe)
  if (f === 'mine') return list.filter((x) => x.isMine)
  return list
}

function reportFilterToIndex(f: ReportFilter): number {
  return REPORT_FILTER_TO_INDEX[f]
}

Component({
  behaviors: [requireAuth],
  data: {
    /** 与横向 swiper 同步：0 日常 / 1 报备 */
    swiperCurrent: 0,
    mainModule: 'daily' as MainModule,
    reportFilter: 'all',
    reportFilterIndex: 1,
    dailyList: DAILY_MOCK,
    reportListAll: REPORT_MOCK,
    reportDisplayList: REPORT_MOCK,
  },
  lifetimes: {
    attached() {
      this.applyReportFilter()
    },
  },
  methods: {
    applyReportFilter() {
      const { reportListAll, reportFilter } = this.data as {
        reportListAll: ReportItem[]
        reportFilter: ReportFilter
      }
      this.setData({
        reportDisplayList: filterReports(reportListAll, reportFilter),
      })
    },

    /** 进入报备模块时刷新列表（swiper / Tab 两处共用） */
    syncReportListIfNeeded(mainModule: MainModule) {
      if (mainModule === 'report') {
        this.applyReportFilter()
      }
    },

    onMainTab(e: WechatMiniprogram.TouchEvent) {
      const mode = e.currentTarget.dataset.mode as MainModule
      if (!mode) return
      const next = mode === 'daily' ? SWIPER_INDEX.DAILY : SWIPER_INDEX.REPORT
      if (next === this.data.swiperCurrent && mode === this.data.mainModule) return

      this.setData({ swiperCurrent: next, mainModule: mode })
      this.syncReportListIfNeeded(mode)
    },

    onSwiperChange(e: WechatMiniprogram.SwiperChange) {
      const cur = e.detail.current
      const mainModule: MainModule = cur === SWIPER_INDEX.DAILY ? 'daily' : 'report'
      if (mainModule === this.data.mainModule && cur === this.data.swiperCurrent) return

      this.setData({ swiperCurrent: cur, mainModule })
      this.syncReportListIfNeeded(mainModule)
    },
    onReportFilter(e: WechatMiniprogram.TouchEvent) {
      const filter = e.currentTarget.dataset.filter as ReportFilter
      if (!filter || filter === this.data.reportFilter) return
      this.setData({ reportFilter: filter, reportFilterIndex: reportFilterToIndex(filter) })
      this.applyReportFilter()
    },
    onDailyPostTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      wx.showToast({ title: '详情页敬请期待', icon: 'none' })
    },
    onFabTap() {
      wx.showToast({ title: '敬请期待', icon: 'none' })
    },
  },
})
