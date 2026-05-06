import requireAuth from '../../behaviors/require-auth'
import {
  PAGE_REPORT_COMPOSE,
  PAGE_REPORT_DETAIL,
} from '../../constants/paths'
import type { ReportListCloudResult, ReportPostPublic } from '../../types/cloud'
import {
  DEFAULT_RESONANCE_REPORT_FILTER,
  consumeResonancePrefsApplyIfNeeded,
  invalidateResonancePrefsApplyCache,
  resolveResonanceReportFilter,
} from '../../constants/resonance-preferences'
import { setReportEditStaging } from '../../utils/report-edit-staging'
import { formatDailyCloudBizError } from '../../utils/cloud-invoke'
import { enrichReportPostForDisplay, enrichReportPostsForDisplay } from '../../utils/report-feed-display'
import { reportDelete, reportGetReportFeedItem, reportListReports } from '../../utils/report-api'
import moSession, { moCoupleScopeKey, moUserProfileDisplayStamp } from '../../utils/session'

type ReportListOk = Extract<ReportListCloudResult, { ok: true }>

type ReportFilter = 'pending' | 'all' | 'mine'

const REPORT_FILTER_TO_INDEX: Record<ReportFilter, number> = {
  pending: 0,
  all: 1,
  mine: 2,
}

const DEFAULT_REPORT_FILTER: ReportFilter = DEFAULT_RESONANCE_REPORT_FILTER

function normalizeReportPostId(raw: string | undefined): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

function clampReportImageIndex(idx: number, len: number): number {
  if (len <= 0) return 0
  const max = len - 1
  if (idx < 0) return 0
  if (idx > max) return max
  return idx
}

function reportFilterToIndex(f: ReportFilter): number {
  return REPORT_FILTER_TO_INDEX[f]
}

type ResonancePageData = {
  reportFilter: ReportFilter
  reportFilterIndex: number
  reportList: ReportPostPublic[]
  reportRefreshing: boolean
  reportBootstrapping: boolean
  reportLoadingMore: boolean
  reportHasMore: boolean
  reportNextOffset: number
}

type ReportPublishedPayload = {
  mode: 'create' | 'edit'
  post: ReportPostPublic
}

const RESONANCE_COUPLE_SCOPE_KEY = '_resonanceCoupleScopeKey'
const RESONANCE_PROFILE_STAMP_KEY = '_resonanceProfileStampKey'

Component({
  behaviors: [requireAuth],
  pageLifetimes: {
    show() {
      this.syncReportFeedListScope()
      this.applyResonancePreferencesFromSession()
      this.ensureReportFirstPageIfEmpty()
    },
  },
  data: {
    reportFilter: DEFAULT_REPORT_FILTER,
    reportFilterIndex: reportFilterToIndex(DEFAULT_REPORT_FILTER),
    reportList: [],
    reportRefreshing: false,
    reportBootstrapping: false,
    reportLoadingMore: false,
    reportHasMore: true,
    reportNextOffset: 0,
  } as ResonancePageData,
  lifetimes: {
    attached() {
      invalidateResonancePrefsApplyCache()
    },
  },
  methods: {
    syncReportFeedListScope() {
      const coupleKey = moCoupleScopeKey()
      const stamp = moUserProfileDisplayStamp()
      const ext = this as WechatMiniprogram.IAnyObject
      if (
        ext[RESONANCE_COUPLE_SCOPE_KEY] === coupleKey &&
        ext[RESONANCE_PROFILE_STAMP_KEY] === stamp
      ) {
        return
      }
      ext[RESONANCE_COUPLE_SCOPE_KEY] = coupleKey
      ext[RESONANCE_PROFILE_STAMP_KEY] = stamp
      this.setData({
        reportList: [],
        reportHasMore: true,
        reportNextOffset: 0,
      })
    },

    applyResonancePreferencesFromSession() {
      const u = moSession.loadMoUser()
      const openId = u ? u.openId : undefined
      const prefs = u ? u.preferences : undefined
      if (!consumeResonancePrefsApplyIfNeeded(openId, prefs)) return
      const reportFilter = resolveResonanceReportFilter(prefs)
      this.setData({
        reportFilter,
        reportFilterIndex: reportFilterToIndex(reportFilter),
        reportList: [],
        reportHasMore: true,
        reportNextOffset: 0,
      })
      void this.loadReportList({ reset: true, useRefresher: false })
    },

    ensureReportFirstPageIfEmpty() {
      const d = this.data as ResonancePageData
      if (d.reportList.length > 0) return
      if (d.reportBootstrapping || d.reportRefreshing) return
      void this.loadReportList({ reset: true, useRefresher: false })
    },

    async applyReportListPage(r: ReportListOk, mergeWithExisting: boolean): Promise<void> {
      const chunk = await enrichReportPostsForDisplay(r.list)
      if (mergeWithExisting) {
        const merged = [...this.data.reportList, ...chunk]
        this.setData({
          reportList: merged,
          reportHasMore: r.hasMore,
          reportNextOffset: r.nextOffset,
        })
      } else {
        this.setData({
          reportList: chunk,
          reportHasMore: r.hasMore,
          reportNextOffset: r.nextOffset,
        })
      }
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
          await this.applyReportListPage(r, false)
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
        await this.applyReportListPage(r, true)
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
      const postId = normalizeReportPostId(rawPostId)
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

    onReportFilter(e: WechatMiniprogram.TouchEvent) {
      const filter = e.currentTarget.dataset.filter as ReportFilter
      if (!filter || filter === this.data.reportFilter) return
      this.setData({ reportFilter: filter, reportFilterIndex: reportFilterToIndex(filter) })
      void this.loadReportList({ reset: true, useRefresher: false })
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
          resonanceListNeedRefreshFromDetail: (payload: { postId?: string }) => {
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
      const idx = clampReportImageIndex(imgIndex, urls.length)
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
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatDailyCloudBizError(r.error), icon: 'none' })
          return
        }
        const list = this.data.reportList.filter((x) => x.id !== id)
        this.setData({ reportList: list })
        wx.showToast({ title: '已删除', icon: 'success' })
      } finally {
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

    onReportComposeFabTap() {
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
  },
})
