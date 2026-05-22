import requireAuth from '../../behaviors/require-auth'
import {
  PAGE_REPORT_COMPOSE,
  PAGE_REPORT_DETAIL,
} from '../../constants/paths'
import type { ReportPostPublic } from '../../types/cloud'
import {
  DEFAULT_RESONANCE_REPORT_FILTER,
  consumeResonancePrefsApplyIfNeeded,
  invalidateResonancePrefsApplyCache,
  resolveResonanceReportFilter,
} from '../../constants/resonance-preferences'
import { setReportEditStaging } from '../../utils/report-edit-staging'
import { formatCloudBizError } from '../../utils/cloud-invoke'
import { enrichReportPostForDisplay, enrichReportPostsForDisplay } from '../../utils/display/report-feed-display'
import { reportDelete, reportGetReportFeedItem, reportListReports } from '../../utils/api/report-api'
import moSession, { moCoupleScopeKey, moUserProfileDisplayStamp } from '../../utils/session'

type ReportFilter = 'mine' | 'action_needed' | 'all'

const REPORT_FILTER_TO_INDEX: Record<ReportFilter, number> = {
  mine: 0,
  action_needed: 1,
  all: 2,
}

type TabSlot = {
  filter: ReportFilter
  list: ReportPostPublic[]
  hasMore: boolean
  nextOffset: number
  bootstrapping: boolean
  refreshing: boolean
  loadingMore: boolean
  silentRefreshing: boolean
  everLoaded: boolean
}

function freshTabSlot(filter: ReportFilter): TabSlot {
  return {
    filter,
    list: [],
    hasMore: true,
    nextOffset: 0,
    bootstrapping: false,
    refreshing: false,
    loadingMore: false,
    silentRefreshing: false,
    everLoaded: false,
  }
}

function resolveTabIndex(filter: ReportFilter): number {
  return REPORT_FILTER_TO_INDEX[filter]
}

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

function parseTabIndexFromDataset(e: WechatMiniprogram.CustomEvent): number {
  const raw = e.currentTarget.dataset.tab
  if (typeof raw === 'number') return raw
  const n = parseInt(String(raw), 10)
  return isNaN(n) ? 0 : n
}

type ResonancePageData = {
  reportFilterIndex: number
  tabs: TabSlot[]
}

type ReportPublishedPayload = {
  mode: 'create' | 'edit'
  post: ReportPostPublic
}

interface ResonanceCustomInstanceProperty {
  _resonanceCoupleScopeKey: string
  _resonanceProfileStampKey: string
}

type ResonanceMethods = WechatMiniprogram.Component.MethodOption

Component<ResonancePageData, {}, ResonanceMethods, ResonanceCustomInstanceProperty>({
  behaviors: [requireAuth],
  pageLifetimes: {
    show() {
      this.syncReportFeedListScope()
      this.applyResonancePreferencesFromSession()
      this.ensureReportFirstPageIfEmpty()
    },
  },
  data: {
    reportFilterIndex: resolveTabIndex(DEFAULT_RESONANCE_REPORT_FILTER),
    tabs: [
      freshTabSlot('mine'),
      freshTabSlot('action_needed'),
      freshTabSlot('all'),
    ],
  },
  lifetimes: {
    attached() {
      invalidateResonancePrefsApplyCache()
    },
  },
  methods: {
    activateTab(index: number) {
      if (index < 0 || index > 2) return
      if (index === this.data.reportFilterIndex) return

      this.setData({ reportFilterIndex: index })

      const tab = this.data.tabs[index]
      if (tab.everLoaded) {
        void this.silentRefreshTab(index)
        return
      }
      if (tab.bootstrapping) return
      void this.bootstrapTab(index)
    },

    async bootstrapTab(index: number) {
      const tab = this.data.tabs[index]
      if (tab.bootstrapping || tab.refreshing) return
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }

      this.setData({ ['tabs[' + index + '].bootstrapping']: true })
      try {
        const r = await reportListReports(0, tab.filter)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        const chunk = await enrichReportPostsForDisplay(r.list)
        this.setData({
          ['tabs[' + index + '].list']: chunk,
          ['tabs[' + index + '].hasMore']: r.hasMore,
          ['tabs[' + index + '].nextOffset']: r.nextOffset,
          ['tabs[' + index + '].everLoaded']: true,
          ['tabs[' + index + '].bootstrapping']: false,
        })
      } catch (_) {
        this.setData({ ['tabs[' + index + '].bootstrapping']: false })
      }
    },

    async fullRefreshTab(index: number) {
      const tab = this.data.tabs[index]
      if (tab.refreshing || tab.bootstrapping) return
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }

      this.setData({ ['tabs[' + index + '].refreshing']: true })
      try {
        const r = await reportListReports(0, tab.filter)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        const chunk = await enrichReportPostsForDisplay(r.list)
        this.setData({
          ['tabs[' + index + '].list']: chunk,
          ['tabs[' + index + '].hasMore']: r.hasMore,
          ['tabs[' + index + '].nextOffset']: r.nextOffset,
          ['tabs[' + index + '].everLoaded']: true,
          ['tabs[' + index + '].refreshing']: false,
        })
      } catch (_) {
        this.setData({ ['tabs[' + index + '].refreshing']: false })
      }
    },

    async silentRefreshTab(index: number) {
      const tab = this.data.tabs[index]
      if (tab.silentRefreshing || tab.refreshing || tab.bootstrapping) return
      if (!wx.cloud) return

      this.setData({ ['tabs[' + index + '].silentRefreshing']: true })
      try {
        const r = await reportListReports(0, tab.filter)
        if (!r || !r.ok) return

        const existingIds = new Set(tab.list.map(function (x) { return x.id }))
        const newItems: ReportPostPublic[] = []
        for (var ni = 0; ni < r.list.length; ni++) {
          if (!existingIds.has(r.list[ni].id)) {
            newItems.push(r.list[ni])
          }
        }
        if (newItems.length === 0) return

        const enriched = await enrichReportPostsForDisplay(newItems)
        const merged = enriched.concat(tab.list)
        this.setData({ ['tabs[' + index + '].list']: merged })
      } finally {
        this.setData({ ['tabs[' + index + '].silentRefreshing']: false })
      }
    },

    syncReportFeedListScope() {
      const coupleKey = moCoupleScopeKey()
      const stamp = moUserProfileDisplayStamp()
      if (
        this._resonanceCoupleScopeKey === coupleKey &&
        this._resonanceProfileStampKey === stamp
      ) {
        return
      }
      this._resonanceCoupleScopeKey = coupleKey
      this._resonanceProfileStampKey = stamp
      this.setData({
        tabs: [
          freshTabSlot('mine'),
          freshTabSlot('action_needed'),
          freshTabSlot('all'),
        ],
      })
    },

    applyResonancePreferencesFromSession() {
      const u = moSession.loadMoUser()
      const openId = u ? u.openId : undefined
      const prefs = u ? u.preferences : undefined
      if (!consumeResonancePrefsApplyIfNeeded(openId, prefs)) return
      const filter = resolveResonanceReportFilter(prefs)
      const index = resolveTabIndex(filter)
      this.activateTab(index)
    },

    ensureReportFirstPageIfEmpty() {
      const tab = this.data.tabs[this.data.reportFilterIndex]
      if (tab.list.length > 0) return
      if (tab.bootstrapping || tab.refreshing) return
      void this.bootstrapTab(this.data.reportFilterIndex)
    },

    onReportRefresh(e: WechatMiniprogram.CustomEvent) {
      const index = parseTabIndexFromDataset(e)
      void this.fullRefreshTab(index)
    },

    async onReportScrollToLower(e: WechatMiniprogram.CustomEvent) {
      const index = parseTabIndexFromDataset(e)
      const tab = this.data.tabs[index]
      if (tab.loadingMore || !tab.hasMore) return
      if (!wx.cloud) return

      this.setData({ ['tabs[' + index + '].loadingMore']: true })
      try {
        const r = await reportListReports(tab.nextOffset, tab.filter)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        const chunk = await enrichReportPostsForDisplay(r.list)
        const merged = tab.list.concat(chunk)
        this.setData({
          ['tabs[' + index + '].list']: merged,
          ['tabs[' + index + '].hasMore']: r.hasMore,
          ['tabs[' + index + '].nextOffset']: r.nextOffset,
          ['tabs[' + index + '].loadingMore']: false,
        })
      } catch (_) {
        this.setData({ ['tabs[' + index + '].loadingMore']: false })
      }
    },

    onTabTap(e: WechatMiniprogram.TouchEvent) {
      const filter = e.currentTarget.dataset.filter as ReportFilter
      if (!filter) return
      this.activateTab(resolveTabIndex(filter))
    },

    onSwiperChange(e: WechatMiniprogram.CustomEvent) {
      const index = e.detail.current as number
      if (index === this.data.reportFilterIndex) return
      this.activateTab(index)
    },

    async patchReportListItemFromDetail(rawPostId: string | undefined) {
      const postId = normalizeReportPostId(rawPostId)
      if (!postId || !wx.cloud) return

      const tabs = this.data.tabs
      const indices: number[] = []
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].list.some(function (x) { return x.id === postId })) {
          indices.push(i)
        }
      }
      if (indices.length === 0) return

      const r = await reportGetReportFeedItem(postId)
      if (!r || !r.ok || !r.post) return
      const post = await enrichReportPostForDisplay(r.post)

      const updateMap: Record<string, unknown> = {}
      for (var ii = 0; ii < indices.length; ii++) {
        var idx = indices[ii]
        var list = tabs[idx].list.slice()
        var pos = list.findIndex(function (x) { return x.id === postId })
        if (pos >= 0) {
          list[pos] = post
          updateMap['tabs[' + idx + '].list'] = list
        }
      }
      if (Object.keys(updateMap).length > 0) {
        this.setData(updateMap)
      }
    },

    onReportCardTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      var self = this
      wx.navigateTo({
        url: PAGE_REPORT_DETAIL + '?id=' + encodeURIComponent(id),
        events: {
          resonanceListNeedRefreshFromDetail: function (payload: { postId?: string }) {
            const pid = payload && typeof payload.postId === 'string' ? payload.postId : undefined
            void self.patchReportListItemFromDetail(pid)
          },
        },
      })
    },

    onReportImageTap(e: WechatMiniprogram.TouchEvent) {
      const postId = e.currentTarget.dataset.postId as string | undefined
      if (!postId) return
      const rawIdx = e.currentTarget.dataset.imgIndex
      var imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const tab = this.data.tabs[this.data.reportFilterIndex]
      const row = tab.list.find(function (x) { return x.id === postId })
      if (!row || !row.images || row.images.length === 0) return
      const urls = row.images
      const idx = clampReportImageIndex(imgIndex, urls.length)
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({
        current: cur,
        urls: urls,
      })
    },

    onReportPostLongPress(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as string | undefined
      if (!id) return
      const tab = this.data.tabs[this.data.reportFilterIndex]
      const item = tab.list.find(function (x) { return x.id === id })
      if (!item) return
      if (!item.isMine) {
        wx.showToast({ title: '仅可操作自己发布的报备', icon: 'none' })
        return
      }
      var self = this
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: function (res) {
          if (res.tapIndex === 0) {
            self.openReportComposeEdit(item)
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '删除报备',
              content: '确定删除这条报备？删除后无法恢复。',
              confirmText: '删除',
              cancelText: '取消',
              confirmColor: '#4A6670',
              success: function (m) {
                if (m.confirm) {
                  void self.confirmDeleteReport(id)
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
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        const updateMap: Record<string, unknown> = {}
        for (var i = 0; i < this.data.tabs.length; i++) {
          const list = this.data.tabs[i].list
          if (list.some(function (x) { return x.id === id })) {
            updateMap['tabs[' + i + '].list'] = list.filter(function (x) { return x.id !== id })
          }
        }
        if (Object.keys(updateMap).length > 0) {
          this.setData(updateMap)
        }
        wx.showToast({ title: '已删除', icon: 'success' })
      } finally {
        wx.hideLoading()
      }
    },

    navigateToReportCompose() {
      var self = this
      wx.navigateTo({
        url: PAGE_REPORT_COMPOSE,
        events: {
          reportPublished: function (payload: ReportPublishedPayload) {
            void self.applyReportPublished(payload)
          },
        },
      })
    },

    onReportComposeFabTap() {
      this.navigateToReportCompose()
    },

    onReportComposeFabLongPress() {
      var self = this
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['camera'],
        success: function (res) {
          if (res.tempFiles.length > 0) {
            wx.setStorageSync('moilike_report_camera_prefill', res.tempFiles[0].tempFilePath)
          }
          self.navigateToReportCompose()
        },
      })
    },

    openReportComposeEdit(item: ReportPostPublic) {
      setReportEditStaging({
        postId: item.id,
        text: typeof item.body === 'string' ? item.body : '',
        images: [],
      })
      var self = this
      wx.navigateTo({
        url: PAGE_REPORT_COMPOSE + '?id=' + encodeURIComponent(item.id),
        events: {
          reportPublished: function (payload: ReportPublishedPayload) {
            void self.applyReportPublished(payload)
          },
        },
      })
    },

    async applyReportPublished(payload: ReportPublishedPayload) {
      const raw = payload.post
      const enrichedArr = await enrichReportPostsForDisplay([raw])
      const post = enrichedArr[0] != null ? enrichedArr[0] : raw

      const updateMap: Record<string, unknown> = {}
      for (var i = 0; i < this.data.tabs.length; i++) {
        const tab = this.data.tabs[i]
        var list = tab.list.slice()

        if (payload.mode === 'edit') {
          var editIdx = list.findIndex(function (x) { return x.id === raw.id })
          if (editIdx >= 0) {
            list[editIdx] = post
            updateMap['tabs[' + i + '].list'] = list
          }
        } else {
          // create mode
          if (tab.filter === 'mine') {
            if (post.isMine) {
              list.unshift(post)
              updateMap['tabs[' + i + '].list'] = list
            }
          } else if (tab.filter === 'action_needed') {
            if (!post.isMine && post.partnerState !== 'evaluated') {
              list.unshift(post)
              updateMap['tabs[' + i + '].list'] = list
            }
          } else if (tab.filter === 'all') {
            list.unshift(post)
            updateMap['tabs[' + i + '].list'] = list
          }
        }
      }
      if (Object.keys(updateMap).length > 0) {
        this.setData(updateMap)
      }
    },
  },
})
