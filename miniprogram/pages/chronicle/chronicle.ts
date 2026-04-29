import { redirectIfNotAuthed } from '../../utils/auth-guard'

type MainModule = 'daily' | 'report'
type ReportFilter = 'pending' | 'all' | 'mine'

type DailyItem = {
  id: string
  userName: string
  time: string
  tag: string
  tagTone: 'pink' | 'green'
  snippet: string
  media: 'single' | 'double' | 'loading'
  footUser: string
  footText: string
  footTime: string
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
    userName: '江江',
    time: '04-24 22:40',
    tag: '好香',
    tagTone: 'pink',
    snippet: '这是一个测试数据',
    media: 'loading',
    footUser: '江江',
    footText: '想吃',
    footTime: '04-24 22:41',
  },
  {
    id: 'd2',
    userName: '江江',
    time: '04-23 18:20',
    tag: '吃饭',
    tagTone: 'green',
    snippet: '和同事约了轻食～',
    media: 'double',
    footUser: '江江',
    footText: '明天继续',
    footTime: '04-23 19:02',
  },
]

const REPORT_MOCK: ReportItem[] = [
  {
    id: 'r1',
    userName: '江江',
    publishTime: '04-23 23:44',
    tag: '干饭222',
    body: '哈哈哈哈',
    readByMe: true,
    isMine: true,
    comments: [{ user: '萌萌', text: 'hchchh' }],
  },
  {
    id: 'r2',
    userName: '江江',
    publishTime: '04-22 12:10',
    tag: '外出',
    body: '中午和同事出去干饭，大概 1h 回来',
    readByMe: false,
    isMine: true,
    comments: [{ user: '江江', text: '收到' }],
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

Component({
  pageLifetimes: {
    show() {
      redirectIfNotAuthed()
    },
  },
  data: {
    mainModule: 'daily',
    reportFilter: 'all',
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
    onMainTab(e: WechatMiniprogram.TouchEvent) {
      const mode = e.currentTarget.dataset.mode as MainModule
      if (!mode || mode === this.data.mainModule) return
      this.setData({ mainModule: mode })
      if (mode === 'report') this.applyReportFilter()
    },
    onReportFilter(e: WechatMiniprogram.TouchEvent) {
      const filter = e.currentTarget.dataset.filter as ReportFilter
      if (!filter || filter === this.data.reportFilter) return
      this.setData({ reportFilter: filter })
      this.applyReportFilter()
    },
    onFabTap() {
      wx.showToast({ title: '敬请期待', icon: 'none' })
    },
  },
})
