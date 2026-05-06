import requireAuth from '../../../behaviors/require-auth'
import type { ReportPostPublic } from '../../../types/cloud'
import { formatDailyCloudBizError } from '../../../utils/cloud-invoke'
import { enrichReportPostForDisplay } from '../../../utils/report-feed-display'
import { reportEvaluate, reportGetReport, reportMarkRead } from '../../../utils/report-api'

function reportDetailBizToast(r: { ok?: boolean; error?: string } | null, fallback: string): string {
  if (r && r.ok === false) return formatDailyCloudBizError(r.error)
  return fallback
}

type DetailThis = WechatMiniprogram.Component.Instance<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject
> & {
  getOpenerEventChannel?: () => WechatMiniprogram.EventChannel
}

Component({
  behaviors: [requireAuth],
  data: {
    postId: '',
    postLoading: true,
    post: null as ReportPostPublic | null,
    evalDraft: '',
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
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
  },
  methods: {
    emitRefreshToChronicle() {
      const self = this as DetailThis
      const ch = typeof self.getOpenerEventChannel === 'function' ? self.getOpenerEventChannel() : null
      const pid = (this.data as { postId?: string }).postId || ''
      if (ch && typeof ch.emit === 'function' && pid) {
        ch.emit('reportListNeedRefreshFromDetail', { postId: pid })
      }
    },

    async loadPost() {
      const postId = (this.data as { postId: string }).postId
      if (!postId) return
      this.setData({ postLoading: true })
      const r = await reportGetReport(postId)
      if (!r || !r.ok || !r.post) {
        wx.showToast({
          title: reportDetailBizToast(r, '加载失败'),
          icon: 'none',
        })
        this.setData({ post: null, postLoading: false })
        return
      }
      const post = await enrichReportPostForDisplay(r.post)
      this.setData({ post, postLoading: false })
    },

    onNavBack() {
      if (this.data.post) {
        this.emitRefreshToChronicle()
      }
      wx.navigateBack({ fail: () => {} })
    },

    onEvalInput(e: WechatMiniprogram.Input) {
      this.setData({ evalDraft: e.detail.value || '' })
    },

    onImageTap(e: WechatMiniprogram.TouchEvent) {
      const post = this.data.post as ReportPostPublic | null
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
      const postId = (this.data as { postId: string }).postId
      if (!postId) return
      wx.showLoading({ title: '处理中', mask: true })
      try {
        const r = await reportMarkRead(postId)
        wx.hideLoading()
        if (!r || !r.ok || !r.post) {
          wx.showToast({
            title: reportDetailBizToast(r, '失败'),
            icon: 'none',
          })
          return
        }
        const post = await enrichReportPostForDisplay(r.post)
        this.setData({ post })
        this.emitRefreshToChronicle()
        wx.showToast({ title: '已标记已阅', icon: 'success' })
      } catch {
        wx.hideLoading()
      }
    },

    async onSubmitEval() {
      const postId = (this.data as { postId: string }).postId
      const text = ((this.data as { evalDraft?: string }).evalDraft || '').trim()
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
            title: reportDetailBizToast(r, '失败'),
            icon: 'none',
          })
          return
        }
        const post = await enrichReportPostForDisplay(r.post)
        this.setData({ post, evalDraft: '' })
        this.emitRefreshToChronicle()
        wx.showToast({ title: '已提交评价', icon: 'success' })
      } catch {
        wx.hideLoading()
      }
    },
  },
})
