import requireAuth from '../../behaviors/require-auth'
import {
  PAGE_DAILY_COMPOSE,
  PAGE_DAILY_DETAIL,
  PAGE_REPORT_COMPOSE,
  PAGE_REPORT_DETAIL,
} from '../../constants/paths'
import type { DailyPostPublic, ReportPostPublic } from '../../types/cloud'
import {
  dailyDeleteDaily,
  dailyGetDailyFeedItem,
  dailyListDaily,
} from '../../utils/daily-api'
import { setDailyEditStaging } from '../../utils/daily-edit-staging'
import { setReportEditStaging } from '../../utils/report-edit-staging'
import { formatDailyCloudBizError } from '../../utils/cloud-invoke'
import { enrichDailyPostsForDisplay } from '../../utils/daily-feed-display'
import { enrichReportPostForDisplay, enrichReportPostsForDisplay } from '../../utils/report-feed-display'
import { reportDelete, reportGetReportFeedItem, reportListReports } from '../../utils/report-api'
import moSession, { moUserProfileDisplayStamp } from '../../utils/session'
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
  reportList: ReportPostPublic[]
  reportRefreshing: boolean
  reportBootstrapping: boolean
  reportLoadingMore: boolean
  reportHasMore: boolean
  reportNextOffset: number
}

type DailyPublishedPayload = {
  mode: 'create' | 'edit'
  post: DailyPostPublic
}

type ReportPublishedPayload = {
  mode: 'create' | 'edit'
  post: ReportPostPublic
}

/** 用于日常列表：伴侣关系变化时清空本地列表并重新拉取（避免仍只缓存「仅自己」的旧数据） */
const CHRONICLE_DAILY_COUPLE_SCOPE_KEY = '_chronicleDailyCoupleScopeKey'
/** 本地会话昵称/头像相对上次页面 show 有变时清空日常列表并重拉（与云函数 listDaily 的 users 合并展示一致） */
const CHRONICLE_DAILY_PROFILE_STAMP_KEY = '_chronicleDailyProfileStamp'

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
      this.syncDailyListProfileStamp()
      this.applyChroniclePreferencesFromSession()
      this.ensureDailyFirstPageIfEmpty(this.data.mainModule as MainModule)
      this.ensureReportFirstPageIfEmpty(this.data.mainModule as MainModule)
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
    reportList: [],
    reportRefreshing: false,
    reportBootstrapping: false,
    reportLoadingMore: false,
    reportHasMore: true,
    reportNextOffset: 0,
  } as ChroniclePageData,
  lifetimes: {
    attached() {
      invalidateChroniclePrefsApplyCache()
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
        reportList: [],
        reportHasMore: true,
        reportNextOffset: 0,
      })
    },

    /** 个人资料（昵称/头像）在本地会话中更新后：清空日常列表并由 ensureDailyFirstPageIfEmpty 重拉 */
    syncDailyListProfileStamp() {
      const stamp = moUserProfileDisplayStamp()
      const ext = this as WechatMiniprogram.IAnyObject
      if (ext[CHRONICLE_DAILY_PROFILE_STAMP_KEY] === stamp) return
      ext[CHRONICLE_DAILY_PROFILE_STAMP_KEY] = stamp
      this.setData({
        dailyList: [],
        dailyHasMore: true,
        dailyNextOffset: 0,
        reportList: [],
        reportHasMore: true,
        reportNextOffset: 0,
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
        reportList: [],
        reportHasMore: true,
        reportNextOffset: 0,
      })
      void this.loadReportList({ reset: true, useRefresher: false })
      this.ensureDailyFirstPageIfEmpty(this.data.mainModule as MainModule)
    },

    /** 当前为「日常」且无列表时拉首屏（onShow / 偏好切换 / 切回日常 Tab） */
    ensureDailyFirstPageIfEmpty(mainModule: MainModule) {
      if (mainModule !== 'daily') return
      const { dailyList } = this.data as ChroniclePageData
      if (dailyList.length > 0) return
      void this.loadDailyList({ reset: true, useRefresher: false })
    },

    /** 当前为「报备」且无列表时拉首屏 */
    ensureReportFirstPageIfEmpty(mainModule: MainModule) {
      if (mainModule !== 'report') return
      const { reportList } = this.data as ChroniclePageData
      if (reportList.length > 0) return
      void this.loadReportList({ reset: true, useRefresher: false })
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

    /** 从日常详情返回后仅合并一条列表项（不重拉整页、不重置分页）。 */
    async patchDailyListItemFromDetail(rawPostId: string | undefined) {
      const postId = typeof rawPostId === 'string' ? rawPostId.trim() : ''
      if (!postId || !wx.cloud) return
      const items = this.data.dailyList as DailyItem[]
      const idx = items.findIndex((x) => x.id === postId)
      if (idx < 0) return
      const r = await dailyGetDailyFeedItem(postId)
      if (!r) return
      if (!r.ok) {
        const err = typeof r.error === 'string' ? r.error : ''
        if (err === '不存在' || err === '无权查看') {
          this.setData({ dailyList: items.filter((x) => x.id !== postId) })
        }
        return
      }
      const enriched = await enrichDailyPostsForDisplay([r.post])
      const post = enriched[0] != null ? enriched[0] : r.post
      const list = [...items]
      list[idx] = post
      this.setData({ dailyList: list })
    },

    onDailyRefresh() {
      void this.loadDailyList({ reset: true, useRefresher: true })
    },

    onDailyScrollToLower() {
      void this.loadDailyList({ reset: false })
    },

    async loadReportList(opts: { reset: boolean; useRefresher?: boolean }) {
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      const reset = opts.reset
      const useRefresher = opts.useRefresher === true
      const filter = this.data.reportFilter as ReportFilter
      if (reset) {
        if (useRefresher) {
          if (this.data.reportRefreshing) return
          this.setData({ reportRefreshing: true })
        } else {
          if (this.data.reportBootstrapping) return
          this.setData({ reportBootstrapping: true })
        }
        try {
          const r = await reportListReports(0, filter)
          if (!r) return
          if (!r.ok) {
            wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
            return
          }
          const list = await enrichReportPostsForDisplay(r.list)
          this.setData({
            reportList: list,
            reportHasMore: r.hasMore,
            reportNextOffset: r.nextOffset,
          })
        } finally {
          if (useRefresher) {
            this.setData({ reportRefreshing: false })
          } else {
            this.setData({ reportBootstrapping: false })
          }
        }
        return
      }

      if (this.data.reportLoadingMore || !this.data.reportHasMore) return
      this.setData({ reportLoadingMore: true })
      try {
        const off = this.data.reportNextOffset
        const r = await reportListReports(off, filter)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
          return
        }
        const chunk = await enrichReportPostsForDisplay(r.list)
        const merged = [...this.data.reportList, ...chunk]
        this.setData({
          reportList: merged,
          reportHasMore: r.hasMore,
          reportNextOffset: r.nextOffset,
        })
      } finally {
        this.setData({ reportLoadingMore: false })
      }
    },

    onReportRefresh() {
      void this.loadReportList({ reset: true, useRefresher: true })
    },

    onReportScrollToLower() {
      void this.loadReportList({ reset: false })
    },

    async patchReportListItemFromDetail(rawPostId: string | undefined) {
      const postId = typeof rawPostId === 'string' ? rawPostId.trim() : ''
      if (!postId || !wx.cloud) return
      const items = this.data.reportList as ReportPostPublic[]
      const idx = items.findIndex((x) => x.id === postId)
      if (idx < 0) return
      const r = await reportGetReportFeedItem(postId)
      if (!r || !r.ok || !r.post) return
      const post = await enrichReportPostForDisplay(r.post)
      const list = [...items]
      list[idx] = post
      this.setData({ reportList: list })
    },

    /** 进入对应模块时的副作用（日常首屏 / 报备筛选） */
    syncMainModuleSideEffects(mainModule: MainModule) {
      if (mainModule === 'daily') {
        this.ensureDailyFirstPageIfEmpty(mainModule)
      }
      if (mainModule === 'report') {
        this.ensureReportFirstPageIfEmpty(mainModule)
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
      void this.loadReportList({ reset: true, useRefresher: false })
    },

    /** 点击图片：原生全屏预览（不冒泡，避免触发卡片长按菜单） */
    onDailyPostTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      wx.navigateTo({
        url: `${PAGE_DAILY_DETAIL}?id=${encodeURIComponent(id)}`,
        events: {
          dailyListNeedRefreshFromDetail: (payload: { postId?: string }) => {
            const pid =
              payload && typeof payload.postId === 'string' ? payload.postId : undefined
            void this.patchDailyListItemFromDetail(pid)
          },
        },
      })
    },

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
        images: [],
      })
      wx.navigateTo({
        url: `${PAGE_DAILY_COMPOSE}?id=${encodeURIComponent(item.id)}`,
        events: {
          dailyPublished: (payload: DailyPublishedPayload) => void this.applyDailyPublished(payload),
        },
        success: (res) => {
          res.eventChannel.emit('composeInit', {
            text: typeof item.snippet === 'string' ? item.snippet : '',
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

    onReportFabTap() {
      if (this.data.mainModule !== 'report') return
      this.navigateToReportCompose()
    },

    navigateToReportCompose() {
      wx.navigateTo({
        url: PAGE_REPORT_COMPOSE,
        events: {
          reportPublished: (payload: ReportPublishedPayload) =>
            void this.applyReportPublished(payload),
        },
      })
    },

    onReportCardTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      wx.navigateTo({
        url: `${PAGE_REPORT_DETAIL}?id=${encodeURIComponent(id)}`,
        events: {
          reportListNeedRefreshFromDetail: (payload: { postId?: string }) => {
            const pid =
              payload && typeof payload.postId === 'string' ? payload.postId : undefined
            void this.patchReportListItemFromDetail(pid)
          },
        },
      })
    },

    onReportImageTap(e: WechatMiniprogram.TouchEvent) {
      const postId = e.currentTarget.dataset.postId as string | undefined
      if (!postId) return
      const rawIdx = e.currentTarget.dataset.imgIndex
      let imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const row = this.data.reportList.find((x) => x.id === postId)
      if (!row || !row.images || row.images.length === 0) return
      const urls = row.images
      const max = urls.length - 1
      const idx = imgIndex < 0 ? 0 : imgIndex > max ? max : imgIndex
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({
        current: cur,
        urls,
      })
    },

    onReportPostLongPress(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      const item = this.data.reportList.find((x) => x.id === id)
      if (!item) return
      if (!item.isMine) {
        wx.showToast({ title: '仅可操作自己发布的报备', icon: 'none' })
        return
      }
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.openReportComposeEdit(item)
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '删除报备',
              content: '确定删除这条报备？删除后无法恢复。',
              confirmText: '删除',
              cancelText: '取消',
              confirmColor: '#4A6670',
              success: (m) => {
                if (m.confirm) {
                  void this.confirmDeleteReport(id)
                }
              },
            })
          }
        },
      })
    },

    async confirmDeleteReport(id: string) {
      wx.showLoading({ title: '删除中', mask: true })
      try {
        const r = await reportDelete(id)
        wx.hideLoading()
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
          return
        }
        const list = this.data.reportList.filter((x) => x.id !== id)
        this.setData({ reportList: list })
        wx.showToast({ title: '已删除', icon: 'success' })
      } catch {
        wx.hideLoading()
      }
    },

    openReportComposeEdit(item: ReportPostPublic) {
      setReportEditStaging({
        postId: item.id,
        text: typeof item.body === 'string' ? item.body : '',
        images: [],
      })
      wx.navigateTo({
        url: `${PAGE_REPORT_COMPOSE}?id=${encodeURIComponent(item.id)}`,
        events: {
          reportPublished: (payload: ReportPublishedPayload) =>
            void this.applyReportPublished(payload),
        },
        success: (res) => {
          res.eventChannel.emit('reportComposeInit', {
            text: typeof item.body === 'string' ? item.body : '',
          })
        },
      })
    },

    onEmptyReportComposeTap() {
      this.navigateToReportCompose()
    },

    async applyReportPublished(payload: ReportPublishedPayload) {
      const raw = payload.post
      const list = [...this.data.reportList]
      if (payload.mode === 'edit') {
        const idx = list.findIndex((x) => x.id === raw.id)
        const enrichedArr = await enrichReportPostsForDisplay([raw])
        const post = enrichedArr[0] != null ? enrichedArr[0] : raw
        if (idx >= 0) {
          list[idx] = post
        } else {
          list.unshift(post)
        }
      } else {
        const enriched = await enrichReportPostsForDisplay([raw])
        const first = enriched[0]
        const post = first != null ? first : raw
        list.unshift(post)
      }
      this.setData({ reportList: list })
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
      const list = [...this.data.dailyList]
      if (payload.mode === 'edit') {
        const idx = list.findIndex((x) => x.id === raw.id)
        const prev = idx >= 0 ? list[idx] : undefined
        const base =
          prev && typeof prev.commentCount === 'number' && prev.commentCount > 0
            ? {
                ...raw,
                commentCount: prev.commentCount,
                firstCommentUserName:
                  typeof prev.firstCommentUserName === 'string'
                    ? prev.firstCommentUserName
                    : '',
                firstCommentText:
                  typeof prev.firstCommentText === 'string' ? prev.firstCommentText : '',
              }
            : raw
        const enrichedArr = await enrichDailyPostsForDisplay([base])
        const post = enrichedArr[0] != null ? enrichedArr[0] : base
        if (idx >= 0) {
          list[idx] = post
        } else {
          list.unshift(post)
        }
      } else {
        const enriched = await enrichDailyPostsForDisplay([raw])
        const enrichedFirst = enriched[0]
        const post = enrichedFirst != null ? enrichedFirst : raw
        list.unshift(post)
      }
      this.setData({ dailyList: list })
    },
  },
})
