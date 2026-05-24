import requireAuth from '../../behaviors/require-auth'
import { PAGE_DAILY_COMPOSE, PAGE_DAILY_DETAIL } from '../../constants/paths'
import type { DailyListCloudResult, DailyPostPublic } from '../../types/cloud'
import { dailyDeleteDaily, dailyGetDailyFeedItem, dailyListDaily, invalidateDailyMediaTempUrlCache } from '../../utils/api/daily-api'
import { setDailyEditStaging } from '../../utils/daily-edit-staging'
import { formatCloudBizError } from '../../utils/cloud-invoke'
import { enrichDailyPostsForDisplay, groupDailyPostsByDate, type DailyGroup } from '../../utils/display/daily-feed-display'
import { saveFeedCache, loadFeedCache } from '../../utils/feed-cache'
import { moCoupleScopeKey, moUserProfileDisplayStamp } from '../../utils/session'

type MomentsPageData = {
  dailyList: DailyPostPublic[]
  dailyGroups: DailyGroup[]
  dailyFilteredGroups: DailyGroup[]
  dailyFilterDateKey: string
  dailyShowBackTop: boolean
  dailyScrollToTop: number
  dailyRefreshing: boolean
  dailyBootstrapping: boolean
  dailyLoadingMore: boolean
  dailyHasMore: boolean
  dailyNextOffset: number
}

type DailyPublishedPayload = {
  mode: 'create' | 'edit'
  post: DailyPostPublic
}

type DailyListOk = Extract<DailyListCloudResult, { ok: true }>

interface MomentsCustomInstanceProperty {
  _momentsDailyCoupleScopeKey: string
  _momentsDailyProfileStampKey: string
}

type MomentsMethods = WechatMiniprogram.Component.MethodOption

function normalizeDailyPostId(raw: string | undefined): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

function dailySnippetForCompose(item: DailyPostPublic): string {
  return typeof item.snippet === 'string' ? item.snippet : ''
}

function mergeDailyEditPreservingCommentPreview(
  prev: DailyPostPublic | undefined,
  raw: DailyPostPublic,
): DailyPostPublic {
  if (!prev || typeof prev.commentCount !== 'number' || prev.commentCount <= 0) {
    return raw
  }
  return {
    ...raw,
    commentCount: prev.commentCount,
    firstCommentUserName:
      typeof prev.firstCommentUserName === 'string' ? prev.firstCommentUserName : '',
    firstCommentText:
      typeof prev.firstCommentText === 'string' ? prev.firstCommentText : '',
  }
}

function clampDailyImageIndex(rawIdx: unknown, maxIndex: number): number {
  if (rawIdx === undefined || rawIdx === null || rawIdx === '') {
    return 0
  }
  const n = Number(rawIdx)
  if (Number.isNaN(n)) {
    return 0
  }
  const i = Math.floor(n)
  if (i < 0) {
    return 0
  }
  if (i > maxIndex) {
    return maxIndex
  }
  return i
}

function computeFilteredGroups(groups: DailyGroup[], dateKey: string): DailyGroup[] {
  if (!dateKey) return groups
  return groups.filter(function (g) { return g.dateKey === dateKey })
}

Component<MomentsPageData, {}, MomentsMethods, MomentsCustomInstanceProperty>({
  behaviors: [requireAuth],
  pageLifetimes: {
    show() {
      this.syncDailyFeedListScope()
      this.ensureDailyFirstPageIfEmpty()
    },
  },
  data: {
    dailyList: [],
    dailyGroups: [],
    dailyFilteredGroups: [],
    dailyFilterDateKey: '',
    dailyShowBackTop: false,
    dailyScrollToTop: 0,
    dailyRefreshing: false,
    dailyBootstrapping: false,
    dailyLoadingMore: false,
    dailyHasMore: true,
    dailyNextOffset: 0,
  },
  methods: {
    syncDailyFeedListScope() {
      const coupleKey = moCoupleScopeKey()
      const profileStamp = moUserProfileDisplayStamp()
      if (
        this._momentsDailyCoupleScopeKey === coupleKey &&
        this._momentsDailyProfileStampKey === profileStamp
      ) {
        return
      }
      this._momentsDailyCoupleScopeKey = coupleKey
      this._momentsDailyProfileStampKey = profileStamp
      this.setData({
        dailyList: [],
        dailyGroups: [],
        dailyFilteredGroups: [],
        dailyFilterDateKey: '',
        dailyHasMore: true,
        dailyNextOffset: 0,
      })
    },

    ensureDailyFirstPageIfEmpty() {
      if (this.data.dailyList.length > 0) return
      if (this.data.dailyBootstrapping || this.data.dailyRefreshing) return

      // 优先从 Storage 缓存恢复，即时渲染，再静默刷新
      const scopeKey = moCoupleScopeKey()
      const cached = loadFeedCache<DailyPostPublic>('daily', scopeKey)
      if (cached) {
        const groups = groupDailyPostsByDate(cached)
        this.setData({
          dailyList: cached,
          dailyGroups: groups,
          dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
          dailyHasMore: true,
          dailyNextOffset: cached.length,
        })
        // 后台静默刷新获取最新数据
        void this.loadDailyList({ reset: true, useRefresher: false })
        return
      }

      void this.loadDailyList({ reset: true, useRefresher: false })
    },

    async applyDailyListPage(r: DailyListOk, mode: 'replace' | 'append'): Promise<void> {
      const chunk = await enrichDailyPostsForDisplay(r.list)
      if (mode === 'replace') {
        const groups = groupDailyPostsByDate(chunk)
        const patch: Record<string, unknown> = {
          dailyList: chunk,
          dailyGroups: groups,
          dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
          dailyHasMore: r.hasMore,
          dailyNextOffset: r.nextOffset,
        }
        this.setData(patch)
        saveFeedCache('daily', chunk, moCoupleScopeKey())
        return
      }
      const merged = [...this.data.dailyList, ...chunk]
      const groups = groupDailyPostsByDate(merged)
      this.setData({
        dailyList: merged,
        dailyGroups: groups,
        dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
        dailyHasMore: r.hasMore,
        dailyNextOffset: r.nextOffset,
      })
    },

    async loadDailyList(opts: { reset: boolean; useRefresher?: boolean }) {
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      const reset = opts.reset
      const useRefresher = opts.useRefresher === true
      if (reset) {
        invalidateDailyMediaTempUrlCache()
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
            wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
            return
          }
          await this.applyDailyListPage(r, 'replace')
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
        const r = await dailyListDaily(this.data.dailyNextOffset)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        await this.applyDailyListPage(r, 'append')
      } finally {
        this.setData({ dailyLoadingMore: false })
      }
    },

    async patchDailyListItemFromDetail(rawPostId: string | undefined) {
      const postId = normalizeDailyPostId(rawPostId)
      if (!postId || !wx.cloud) return
      const idx = this.data.dailyList.findIndex((x) => x.id === postId)
      if (idx < 0) return
      const r = await dailyGetDailyFeedItem(postId)
      if (!r) return
      if (!r.ok) {
        if (r.error === '不存在' || r.error === '无权查看') {
          const list = this.data.dailyList.filter((x) => x.id !== postId)
          const groups = groupDailyPostsByDate(list)
          this.setData({
            dailyList: list,
            dailyGroups: groups,
            dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
          })
        }
        return
      }
      const enriched = await enrichDailyPostsForDisplay([r.post])
      const post = enriched[0] != null ? enriched[0] : r.post
      const list = [...this.data.dailyList]
      list[idx] = post
      const groups = groupDailyPostsByDate(list)
      this.setData({
        dailyList: list,
        dailyGroups: groups,
        dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
      })
    },

    onDailyRefresh() {
      void this.loadDailyList({ reset: true, useRefresher: true })
    },

    onDailyScrollToLower() {
      void this.loadDailyList({ reset: false })
    },

    onDailyFilterDateChange(e: WechatMiniprogram.PickerChange) {
      const val = e.detail.value as string
      this.setData({
        dailyFilterDateKey: val,
        dailyFilteredGroups: computeFilteredGroups(this.data.dailyGroups, val),
      })
    },

    onDailyFilterClear() {
      this.setData({
        dailyFilterDateKey: '',
        dailyFilteredGroups: this.data.dailyGroups,
      })
    },

    onDailyScroll(e: WechatMiniprogram.ScrollViewScroll) {
      const t = e.detail.scrollTop
      const show = t > 200
      if (show !== this.data.dailyShowBackTop) {
        this.setData({ dailyShowBackTop: show })
      }
    },

    onDailyBackTop() {
      this.setData({ dailyScrollToTop: this.data.dailyScrollToTop === 0 ? 1 : 0 })
    },

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
      const daily = this.data.dailyList.find((x) => x.id === postId)
      if (!daily || !daily.images || daily.images.length === 0) return
      const urls = daily.images
      const idx = clampDailyImageIndex(e.currentTarget.dataset.imgIndex, urls.length - 1)
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({
        current: cur,
        urls,
      })
    },

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
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        const list = this.data.dailyList.filter((x) => x.id !== id)
        const groups = groupDailyPostsByDate(list)
        this.setData({
          dailyList: list,
          dailyGroups: groups,
          dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
        })
        wx.showToast({ title: '已删除', icon: 'success' })
      } finally {
        wx.hideLoading()
      }
    },

    openDailyComposeEdit(item: DailyPostPublic) {
      const text = dailySnippetForCompose(item)
      setDailyEditStaging({
        postId: item.id,
        text,
        images: [],
      })
      wx.navigateTo({
        url: `${PAGE_DAILY_COMPOSE}?id=${encodeURIComponent(item.id)}`,
        events: {
          dailyPublished: (payload: DailyPublishedPayload) => void this.applyDailyPublished(payload),
        },
      })
    },

    onComposeFabTap() {
      wx.navigateTo({
        url: PAGE_DAILY_COMPOSE,
        events: {
          dailyPublished: (payload: DailyPublishedPayload) => void this.applyDailyPublished(payload),
        },
      })
    },

    onComposeFabLongPress() {
      var self = this
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['camera'],
        success: function (res) {
          if (res.tempFiles.length > 0) {
            wx.setStorageSync('moilike_daily_camera_prefill', res.tempFiles[0].tempFilePath)
          }
          self.onComposeFabTap()
        },
      })
    },

    async applyDailyPublished(payload: DailyPublishedPayload) {
      const raw = payload.post
      const list = [...this.data.dailyList]
      if (payload.mode === 'edit') {
        const idx = list.findIndex((x) => x.id === raw.id)
        const prev = idx >= 0 ? list[idx] : undefined
        const base = mergeDailyEditPreservingCommentPreview(prev, raw)
        const enrichedArr = await enrichDailyPostsForDisplay([base])
        const post = enrichedArr[0] != null ? enrichedArr[0] : base
        if (idx >= 0) {
          list[idx] = post
        } else {
          list.unshift(post)
        }
      } else {
        const enriched = await enrichDailyPostsForDisplay([raw])
        const post = enriched[0] != null ? enriched[0] : raw
        list.unshift(post)
      }
      const groups = groupDailyPostsByDate(list)
      this.setData({
        dailyList: list,
        dailyGroups: groups,
        dailyFilteredGroups: computeFilteredGroups(groups, this.data.dailyFilterDateKey),
      })
    },
  },
})
