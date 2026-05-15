import requireAuth from '../../../behaviors/require-auth'
import type { ReportPostPublic } from '../../../types/cloud'
import { formatCloudBizError } from '../../../utils/cloud-invoke'
import { enrichReportPostForDisplay } from '../../../utils/display/report-feed-display'
import { reportDelete, reportEvaluate, reportGetReport, reportMarkRead } from '../../../utils/api/report-api'
import { setReportEditStaging } from '../../../utils/report-edit-staging'
import { PAGE_REPORT_COMPOSE, TAB_RESONANCE } from '../../../constants/paths'
import { moUserProfileDisplayStamp } from '../../../utils/session'

type ReportDetailData = {
  postId: string
  postLoading: boolean
  post: ReportPostPublic | null
  evalDraft: string
  evalEditing: boolean
}

interface ReportDetailCustomInstanceProperty {
  _reportDetailProfileStamp: string
  _reportDetailRefreshEmitted: boolean
}

type ReportDetailMethods = WechatMiniprogram.Component.MethodOption

Component<ReportDetailData, {}, ReportDetailMethods, ReportDetailCustomInstanceProperty>({
  behaviors: [requireAuth],
  data: {
    postId: '',
    postLoading: true,
    post: null,
    evalDraft: '',
    evalEditing: false,
  },
  lifetimes: {
    ready() {
      if (this.data.postId) return
      try {
        const pages = getCurrentPages()
        const top = pages[pages.length - 1] as { options?: Record<string, string | undefined> }
        if (top && top.options) {
          this.applyPostId(top.options)
        }
      } catch {
        // ignore
      }
    },
    detached() {
      this.emitRefreshIfNeeded()
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      this.applyPostId(options)
    },
    show() {
      const stamp = moUserProfileDisplayStamp()
      const prev = this._reportDetailProfileStamp
      if (prev !== undefined && prev !== stamp && this.data.postId) {
        void this.loadPost()
      }
      this._reportDetailProfileStamp = stamp
    },
  },
  methods: {
    emitRefreshIfNeeded() {
      if (this._reportDetailRefreshEmitted) return
      this._reportDetailRefreshEmitted = true
      const ch =
        typeof this.getOpenerEventChannel === 'function' ? this.getOpenerEventChannel() : null
      const pid = this.data.postId
      if (ch && typeof ch.emit === 'function' && pid) {
        ch.emit('resonanceListNeedRefreshFromDetail', { postId: pid })
      }
    },

    applyPostId(options: Record<string, string | undefined> | undefined) {
      const raw = options && typeof options.id === 'string' ? options.id : ''
      let id = raw.trim()
      if (id) {
        try {
          id = decodeURIComponent(id)
        } catch {
          // keep id
        }
      }
      this.setData({ postId: id })
      if (!id) {
        wx.showToast({ title: '缺少报备参数', icon: 'none' })
        this.setData({ postLoading: false })
        return
      }
      void this.loadPost()
    },

    async loadPost() {
      const postId = this.data.postId
      if (!postId) return
      this.setData({ postLoading: true })
      const r = await reportGetReport(postId)
      if (!r || !r.ok || !r.post) {
        wx.showToast({
          title: r && r.ok === false ? formatCloudBizError(r.error) : '加载失败',
          icon: 'none',
        })
        this.setData({ post: null, postLoading: false })
        return
      }
      const post = await enrichReportPostForDisplay(r.post)
      this.setData({ post, postLoading: false })
    },

    onNavBack() {
      this.emitRefreshIfNeeded()
      wx.navigateBack({ fail: () => {} })
    },

    onEvalInput(e: WechatMiniprogram.Input) {
      this.setData({ evalDraft: e.detail.value || '' })
    },

    onStartEditEval() {
      const post = this.data.post
      if (!post || !post.canEditEval) return
      this.setData({
        evalEditing: true,
        evalDraft: post.partnerEvalText || '',
      })
    },

    onCancelEditEval() {
      this.setData({ evalEditing: false, evalDraft: '' })
    },

    onImageTap(e: WechatMiniprogram.TouchEvent) {
      const post = this.data.post
      if (!post || !post.images || post.images.length === 0) return
      const rawIdx = e.currentTarget.dataset.index
      let imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const urls = post.images
      const max = urls.length - 1
      const idx = imgIndex < 0 ? 0 : imgIndex > max ? max : imgIndex
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({ current: cur, urls })
    },

    async onMarkRead() {
      const postId = this.data.postId
      if (!postId) return
      wx.showLoading({ title: '处理中', mask: true })
      try {
        const r = await reportMarkRead(postId)
        wx.hideLoading()
        if (!r || !r.ok || !r.post) {
          wx.showToast({
            title: r && r.ok === false ? formatCloudBizError(r.error) : '失败',
            icon: 'none',
          })
          return
        }
        const post = await enrichReportPostForDisplay(r.post)
        this.setData({ post })
        wx.showToast({ title: '已标记已阅', icon: 'success' })
      } catch {
        wx.hideLoading()
      }
    },

    async onSubmitEval() {
      const postId = this.data.postId
      const text = (this.data.evalDraft || '').trim()
      if (!postId) return
      if (!text) {
        wx.showToast({ title: '请填写评价', icon: 'none' })
        return
      }
      wx.showLoading({ title: '提交中', mask: true })
      try {
        const r = await reportEvaluate(postId, text)
        wx.hideLoading()
        if (!r || !r.ok || !r.post) {
          wx.showToast({
            title: r && r.ok === false ? formatCloudBizError(r.error) : '失败',
            icon: 'none',
          })
          return
        }
        const post = await enrichReportPostForDisplay(r.post)
        const editing = this.data.evalEditing
        this.setData({ post, evalDraft: '', evalEditing: false })
        wx.showToast({ title: editing ? '评价已更新' : '已提交评价', icon: 'success' })
      } catch {
        wx.hideLoading()
      }
    },

    onMoreActions() {
      const post = this.data.post
      if (!post || !post.isMine) return
      const postId = this.data.postId
      if (!postId) return
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.openEditCompose(post)
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '删除报备',
              content: '确定删除这条报备？删除后无法恢复。',
              confirmText: '删除',
              cancelText: '取消',
              confirmColor: '#4A6670',
              success: (m) => {
                if (m.confirm) void this.confirmDelete(postId)
              },
            })
          }
        },
      })
    },

    openEditCompose(item: ReportPostPublic) {
      setReportEditStaging({
        postId: item.id,
        text: typeof item.body === 'string' ? item.body : '',
        images: [],
      })
      wx.navigateTo({
        url: `${PAGE_REPORT_COMPOSE}?id=${encodeURIComponent(item.id)}`,
        events: {
          reportPublished: () => {
            void this.loadPost()
          },
        },
      })
    },

    async confirmDelete(id: string) {
      wx.showLoading({ title: '删除中', mask: true })
      try {
        const r = await reportDelete(id)
        if (!r) return
        if (!r.ok) {
          wx.showToast({ title: formatCloudBizError(r.error), icon: 'none' })
          return
        }
        this.emitRefreshIfNeeded()
        wx.showToast({ title: '已删除', icon: 'success', duration: 900 })
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: TAB_RESONANCE })
            },
          })
        }, 320)
      } finally {
        wx.hideLoading()
      }
    },
  },
})
