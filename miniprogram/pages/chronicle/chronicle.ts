import requireAuth from '../../behaviors/require-auth'
import { PAGE_DAILY_COMPOSE } from '../../constants/paths'
import type { DailyPostPublic } from '../../types/cloud'
import {
  dailyDeleteDaily,
  dailyListDaily,
} from '../../utils/daily-api'
import { setDailyEditStaging } from '../../utils/daily-edit-staging'
import { formatDailyCloudBizError } from '../../utils/cloud-invoke'
import { enrichDailyPostsForDisplay } from '../../utils/daily-feed-display'
import moSession from '../../utils/session'
import {
  DEFAULT_CHRONICLE_MAIN_TAB,
  DEFAULT_CHRONICLE_REPORT_FILTER,
  consumeChroniclePrefsApplyIfNeeded,
  invalidateChroniclePrefsApplyCache,
  resolveChronicleEntryPrefs,
} from '../../constants/chronicle-preferences'

type MainModule = 'daily' | 'report'
type ReportFilter = 'pending' | 'all' | 'mine'

const SWIPER_INDEX = { DAILY: 0, REPORT: 1 } as const

const REPORT_FILTER_TO_INDEX: Record<ReportFilter, number> = {
  pending: 0,
  all: 1,
  mine: 2,
}

/** 与偏好默认值一致（用于初始 data；单一来源见 chronicle-preferences） */
const DEFAULT_MAIN_MODULE: MainModule = DEFAULT_CHRONICLE_MAIN_TAB
const DEFAULT_REPORT_FILTER: ReportFilter = DEFAULT_CHRONICLE_REPORT_FILTER

type DailyItem = DailyPostPublic

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

function filterReports(list: ReportItem[], f: ReportFilter): ReportItem[] {
  if (f === 'pending') return list.filter((x) => !x.readByMe)
  if (f === 'mine') return list.filter((x) => x.isMine)
  return list
}

function reportFilterToIndex(f: ReportFilter): number {
  return REPORT_FILTER_TO_INDEX[f]
}

type ChroniclePageData = {
  swiperCurrent: number
  mainModule: MainModule
  reportFilter: ReportFilter
  reportFilterIndex: number
  dailyList: DailyItem[]
  dailyRefreshing: boolean
  dailyBootstrapping: boolean
  dailyLoadingMore: boolean
  dailyHasMore: boolean
  dailyNextOffset: number
  reportListAll: ReportItem[]
  reportDisplayList: ReportItem[]
}

type DailyPublishedPayload = {
  mode: 'create' | 'edit'
  post: DailyPostPublic
}

/** 用于日常列表：伴侣关系变化时清空本地列表并重新拉取（避免仍只缓存「仅自己」的旧数据） */
const CHRONICLE_DAILY_COUPLE_SCOPE_KEY = '_chronicleDailyCoupleScopeKey'

function dailyCoupleScopeKeyFromSession(): string {
  const u = moSession.loadMoUser()
  if (!u) return '|'
  const me = typeof u.openId === 'string' ? u.openId : ''
  let fromPartnerOpenId = ''
  if (typeof u.partnerOpenId === 'string' && u.partnerOpenId.trim()) {
    fromPartnerOpenId = u.partnerOpenId.trim()
  }
  let fromPartner = ''
  if (u.partner && typeof u.partner.openId === 'string' && u.partner.openId.trim()) {
    fromPartner = u.partner.openId.trim()
  }
  const partner = fromPartnerOpenId || fromPartner
  return `${me}|${partner}`
}

Component({
  behaviors: [requireAuth],
  pageLifetimes: {
    show() {
      this.syncDailyListCoupleScope()
      this.applyChroniclePreferencesFromSession()
      this.ensureDailyFirstPageIfEmpty(this.data.mainModule as MainModule)
    },
  },
  data: {
    swiperCurrent: 0,
    mainModule: DEFAULT_MAIN_MODULE,
    reportFilter: DEFAULT_REPORT_FILTER,
    reportFilterIndex: reportFilterToIndex(DEFAULT_REPORT_FILTER),
    dailyList: [],
    dailyRefreshing: false,
    dailyBootstrapping: false,
    dailyLoadingMore: false,
    dailyHasMore: true,
    dailyNextOffset: 0,
    reportListAll: [],
    reportDisplayList: [],
  } as ChroniclePageData,
  lifetimes: {
    attached() {
      invalidateChroniclePrefsApplyCache()
      this.applyReportFilter()
    },
  },
  methods: {
    /** 绑定 / 解绑伴侣后 openId 组合变化：清空日常列表并由 ensureDailyFirstPageIfEmpty 重拉 */
    syncDailyListCoupleScope() {
      const key = dailyCoupleScopeKeyFromSession()
      const ext = this as WechatMiniprogram.IAnyObject
      if (ext[CHRONICLE_DAILY_COUPLE_SCOPE_KEY] === key) return
      ext[CHRONICLE_DAILY_COUPLE_SCOPE_KEY] = key
      this.setData({
        dailyList: [],
        dailyHasMore: true,
        dailyNextOffset: 0,
      })
    },

    /** 按用户云端偏好恢复 Tab；偏好未改时不重复 setData，保留用户在现场切换的位置 */
    applyChroniclePreferencesFromSession() {
      const u = moSession.loadMoUser()
      const openId = u ? u.openId : undefined
      const prefs = u ? u.preferences : undefined
      if (!consumeChroniclePrefsApplyIfNeeded(openId, prefs)) return
      const { mainModule, reportFilter } = resolveChronicleEntryPrefs(prefs)
      const swiperCurrent = mainModule === 'daily' ? SWIPER_INDEX.DAILY : SWIPER_INDEX.REPORT
      this.setData({
        mainModule,
        swiperCurrent,
        reportFilter,
        reportFilterIndex: reportFilterToIndex(reportFilter),
      })
      this.applyReportFilter()
      this.ensureDailyFirstPageIfEmpty(this.data.mainModule as MainModule)
    },

    /** 当前为「日常」且无列表时拉首屏（onShow / 偏好切换 / 切回日常 Tab） */
    ensureDailyFirstPageIfEmpty(mainModule: MainModule) {
      if (mainModule !== 'daily') return
      const { dailyList } = this.data as ChroniclePageData
      if (dailyList.length > 0) return
      void this.loadDailyList({ reset: true, useRefresher: false })
    },

    async loadDailyList(opts: { reset: boolean; useRefresher?: boolean }) {
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      const reset = opts.reset
      const useRefresher = opts.useRefresher === true
      if (reset) {
        if (useRefresher) {
          if (this.data.dailyRefreshing) return
          this.setData({ dailyRefreshing: true })
        } else {
          if (this.data.dailyBootstrapping) return
          this.setData({ dailyBootstrapping: true })
        }
        try {
          const r = await dailyListDaily(0)
          if (!r) return
          if (!r.ok) {
            wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
            return
          }
          const list = await enrichDailyPostsForDisplay(r.list)
          this.setData({
            dailyList: list,
            dailyHasMore: r.hasMore,
            dailyNextOffset: r.nextOffset,
          })
        } finally {
          if (useRefresher) {
            this.setData({ dailyRefreshing: false })
          } else {
            this.setData({ dailyBootstrapping: false })
          }
        }
        return
      }

      if (this.data.dailyLoadingMore || !this.data.dailyHasMore) return
      this.setData({ dailyLoadingMore: true })
      try {
        const off = this.data.dailyNextOffset
        const r = await dailyListDaily(off)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
          return
        }
        const chunk = await enrichDailyPostsForDisplay(r.list)
        const merged = [...this.data.dailyList, ...chunk]
        this.setData({
          dailyList: merged,
          dailyHasMore: r.hasMore,
          dailyNextOffset: r.nextOffset,
        })
      } finally {
        this.setData({ dailyLoadingMore: false })
      }
    },

    onDailyRefresh() {
      void this.loadDailyList({ reset: true, useRefresher: true })
    },

    onDailyScrollToLower() {
      void this.loadDailyList({ reset: false })
    },

    applyReportFilter() {
      const { reportListAll, reportFilter } = this.data as {
        reportListAll: ReportItem[]
        reportFilter: ReportFilter
      }
      this.setData({
        reportDisplayList: filterReports(reportListAll, reportFilter),
      })
    },

    /** 进入对应模块时的副作用（日常首屏 / 报备筛选） */
    syncMainModuleSideEffects(mainModule: MainModule) {
      if (mainModule === 'daily') {
        this.ensureDailyFirstPageIfEmpty(mainModule)
      }
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
      this.syncMainModuleSideEffects(mode)
    },

    onSwiperChange(e: WechatMiniprogram.SwiperChange) {
      const cur = e.detail.current
      const mainModule: MainModule = cur === SWIPER_INDEX.DAILY ? 'daily' : 'report'
      if (mainModule === this.data.mainModule && cur === this.data.swiperCurrent) return

      this.setData({ swiperCurrent: cur, mainModule })
      this.syncMainModuleSideEffects(mainModule)
    },
    onReportFilter(e: WechatMiniprogram.TouchEvent) {
      const filter = e.currentTarget.dataset.filter as ReportFilter
      if (!filter || filter === this.data.reportFilter) return
      this.setData({ reportFilter: filter, reportFilterIndex: reportFilterToIndex(filter) })
      this.applyReportFilter()
    },

    /** 点击图片：原生全屏预览（不冒泡，避免触发卡片长按菜单） */
    onDailyImageTap(e: WechatMiniprogram.TouchEvent) {
      const postId = e.currentTarget.dataset.postId as string | undefined
      if (!postId) return
      const rawIdx = e.currentTarget.dataset.imgIndex
      let imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const daily = this.data.dailyList.find((x) => x.id === postId)
      if (!daily || !daily.images || daily.images.length === 0) return
      const urls = daily.images
      const max = urls.length - 1
      const idx = imgIndex < 0 ? 0 : imgIndex > max ? max : imgIndex
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({
        current: cur,
        urls,
      })
    },

    /** 长按自己的日常卡片：原生 ActionSheet → 编辑 / 删除 */
    onDailyPostLongPress(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      const item = this.data.dailyList.find((x) => x.id === id)
      if (!item) return
      if (!item.isMine) {
        wx.showToast({ title: '仅可操作自己发布的日常', icon: 'none' })
        return
      }
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.openDailyComposeEdit(item)
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '删除日常',
              content: '确定删除这条日常？删除后无法恢复。',
              confirmText: '删除',
              cancelText: '取消',
              confirmColor: '#4A6670',
              success: (m) => {
                if (m.confirm) {
                  void this.confirmDeleteDaily(id)
                }
              },
            })
          }
        },
      })
    },

    async confirmDeleteDaily(id: string) {
      wx.showLoading({ title: '删除中', mask: true })
      try {
        const r = await dailyDeleteDaily(id)
        wx.hideLoading()
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
          return
        }
        const list = this.data.dailyList.filter((x) => x.id !== id)
        this.setData({ dailyList: list })
        wx.showToast({ title: '已删除', icon: 'success' })
      } catch {
        wx.hideLoading()
      }
    },

    openDailyComposeEdit(item: DailyItem) {
      setDailyEditStaging({
        postId: item.id,
        text: typeof item.snippet === 'string' ? item.snippet : '',
        images: Array.isArray(item.images) ? item.images.slice() : [],
      })
      wx.navigateTo({
        url: `${PAGE_DAILY_COMPOSE}?id=${encodeURIComponent(item.id)}`,
        events: {
          dailyPublished: (payload: DailyPublishedPayload) => void this.applyDailyPublished(payload),
        },
        success: (res) => {
          res.eventChannel.emit('composeInit', {
            text: typeof item.snippet === 'string' ? item.snippet : '',
            images: Array.isArray(item.images) ? item.images.slice() : [],
          })
        },
      })
    },

    onEmptyComposeTap() {
      this.navigateToDailyCompose()
    },

    onFabTap() {
      if (this.data.mainModule !== 'daily') return
      this.navigateToDailyCompose()
    },

    navigateToDailyCompose() {
      wx.navigateTo({
        url: PAGE_DAILY_COMPOSE,
        events: {
          dailyPublished: (payload: DailyPublishedPayload) => void this.applyDailyPublished(payload),
        },
      })
    },

    async applyDailyPublished(payload: DailyPublishedPayload) {
      const raw = payload.post
      const enriched = await enrichDailyPostsForDisplay([raw])
      const post = enriched[0] ?? raw
      const list = [...this.data.dailyList]
      if (payload.mode === 'edit') {
        const idx = list.findIndex((x) => x.id === post.id)
        if (idx >= 0) {
          list[idx] = post
        } else {
          list.unshift(post)
        }
      } else {
        list.unshift(post)
      }
      this.setData({ dailyList: list })
    },
  },
})
