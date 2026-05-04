import requireAuth from '../../../behaviors/require-auth'
import type { DailyCommentPublic, DailyPostPublic } from '../../../types/cloud'
import {
  dailyAddComment,
  dailyDeleteComment,
  dailyGetDaily,
  dailyListComments,
  dailyUpdateComment,
} from '../../../utils/daily-api'
import { enrichDailyPostsForDisplay } from '../../../utils/daily-feed-display'
import { formatDailyCloudBizError } from '../../../utils/cloud-invoke'
import { moUserProfileDisplayStamp } from '../../../utils/session'

const MAX_COMMENT_LEN = 500

/** 列表展示：回复目标 id、本人是否可长按编辑/删除（无子回复） */
type DailyCommentVm = DailyCommentPublic & {
  replyTapId: string
  replyTapName: string
  canEditOrDeleteMine: boolean
}

function toPlainComment(c: DailyCommentVm): DailyCommentPublic {
  const out: DailyCommentPublic = {
    id: c.id,
    userName: c.userName,
    time: c.time,
    text: c.text,
    parentId: c.parentId,
    depth: c.depth,
  }
  if (typeof c.isMine === 'boolean') {
    out.isMine = c.isMine
  }
  return out
}

/** 子评论的 parentId 指向主评 id；主评 id 出现在任一 parentId 上则表示该主评已有回复 */
function idsThatHaveDirectReplies(list: DailyCommentPublic[]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < list.length; i++) {
    const pid = list[i].parentId
    if (typeof pid === 'string' && pid.length > 0) {
      out.add(pid)
    }
  }
  return out
}

function buildCommentViewModels(list: DailyCommentPublic[]): DailyCommentVm[] {
  const withReplies = idsThatHaveDirectReplies(list)
  const byId = new Map<string, DailyCommentPublic>()
  for (let i = 0; i < list.length; i++) {
    byId.set(list[i].id, list[i])
  }
  return list.map((c) => {
    const depth = typeof c.depth === 'number' && c.depth > 0 ? c.depth : 0
    let replyTapId = c.id
    let replyTapName = c.userName
    if (depth > 0) {
      const p = c.parentId ? byId.get(c.parentId) : undefined
      const pd = p && typeof p.depth === 'number' ? p.depth : 0
      if (p && pd <= 0) {
        replyTapId = p.id
        replyTapName = p.userName
      } else {
        const fid = typeof c.parentId === 'string' && c.parentId ? c.parentId : c.id
        replyTapId = fid
        replyTapName = c.userName
      }
    }
    const canEditOrDeleteMine = c.isMine === true && !withReplies.has(c.id)
    return { ...c, replyTapId, replyTapName, canEditOrDeleteMine }
  })
}

function findCommentVm(list: DailyCommentVm[], id: string): DailyCommentVm | undefined {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i]
  }
  return undefined
}

type DetailPageThis = WechatMiniprogram.Component.Instance<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject
> & {
  getOpenerEventChannel?: () => WechatMiniprogram.EventChannel
}

type DetailPageData = {
  postId: string
  navTitle: string
  postLoading: boolean
  post: DailyPostPublic | null
  comments: DailyCommentVm[]
  commentDraft: string
  commentDraftIsEmpty: boolean
  replyTarget: { id: string; userName: string } | null
  editingCommentId: string | null
  sending: boolean
  /** 增删改评论后，返回见证页需刷新列表首评摘要 */
  commentsMutated: boolean
}

const DAILY_DETAIL_PROFILE_STAMP_KEY = '_dailyDetailProfileStamp'
const DAILY_DETAIL_REFRESH_EMITTED_KEY = '_dailyDetailRefreshEmitted'

Component({
  behaviors: [requireAuth],
  data: {
    postId: '',
    navTitle: '日常详情',
    postLoading: true,
    post: null,
    comments: [],
    commentDraft: '',
    commentDraftIsEmpty: true,
    replyTarget: null,
    editingCommentId: null,
    sending: false,
    commentsMutated: false,
  } as DetailPageData,
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
      this.notifyChronicleIfCommentsMutated()
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      this.applyPostId(options)
    },
    show() {
      const stamp = moUserProfileDisplayStamp()
      const ext = this as WechatMiniprogram.IAnyObject
      const prev = ext[DAILY_DETAIL_PROFILE_STAMP_KEY]
      if (prev !== undefined && prev !== stamp && this.data.postId) {
        void this.loadAll()
      }
      ext[DAILY_DETAIL_PROFILE_STAMP_KEY] = stamp
    },
  },
  methods: {
    notifyChronicleIfCommentsMutated() {
      const d = this.data as DetailPageData
      if (!d.commentsMutated) return
      const ext = this as WechatMiniprogram.IAnyObject
      if (ext[DAILY_DETAIL_REFRESH_EMITTED_KEY]) return
      ext[DAILY_DETAIL_REFRESH_EMITTED_KEY] = true
      const self = this as DetailPageThis
      const ch = typeof self.getOpenerEventChannel === 'function' ? self.getOpenerEventChannel() : null
      if (ch && typeof ch.emit === 'function') {
        ch.emit('dailyListNeedRefreshFromDetail', { postId: d.postId })
      }
    },

    applyPostId(options: Record<string, string | undefined> | undefined) {
      const id =
        options && typeof options.id === 'string' ? options.id.trim() : ''
      this.setData({ postId: id })
      if (!id) {
        wx.showToast({ title: '缺少帖子参数', icon: 'none' })
        this.setData({ postLoading: false })
        return
      }
      void this.loadAll()
    },

    async loadAll() {
      const postId = this.data.postId
      if (!postId) return
      this.setData({ postLoading: true })
      const [gr, cr] = await Promise.all([dailyGetDaily(postId), dailyListComments(postId)])
      if (!gr || !gr.ok) {
        const errMsg = gr && gr.ok === false ? gr.error : undefined
        this.setData({
          post: null,
          postLoading: false,
          comments: [],
          editingCommentId: null,
          replyTarget: null,
          commentDraft: '',
          commentDraftIsEmpty: true,
        })
        wx.showToast({
          title: formatDailyCloudBizError(errMsg),
          icon: 'none',
        })
        return
      }
      const enriched = await enrichDailyPostsForDisplay([gr.post])
      const enrichedFirst = enriched[0]
      const post = enrichedFirst != null ? enrichedFirst : gr.post
      const rawList =
        cr && cr.ok && Array.isArray(cr.list) ? cr.list : []
      const comments = buildCommentViewModels(rawList)
      this.setData({
        post,
        postLoading: false,
        comments,
        editingCommentId: null,
        replyTarget: null,
        commentDraft: '',
        commentDraftIsEmpty: true,
      })
    },

    onNavBack() {
      this.notifyChronicleIfCommentsMutated()
      wx.navigateBack({ fail: () => {} })
    },

    onPostImageTap(e: WechatMiniprogram.TouchEvent) {
      const post = this.data.post
      if (!post || !post.images || post.images.length === 0) return
      const rawIdx = e.currentTarget.dataset.imgIndex
      let imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const urls = post.images
      const max = urls.length - 1
      let idx = imgIndex
      if (idx < 0) {
        idx = 0
      } else if (idx > max) {
        idx = max
      }
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({
        current: cur,
        urls,
      })
    },

    onCommentRowTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.replyId as string | undefined
      const userName = e.currentTarget.dataset.replyName as string | undefined
      if (!id) return
      const name =
        typeof userName === 'string' && userName.trim() ? userName.trim() : '用户'
      this.setData({
        replyTarget: { id, userName: name },
        editingCommentId: null,
      })
    },

    /** 长按自己的、且尚无回复的评论：与见证页日常卡片一致，ActionSheet → 编辑 / 删除 */
    onCommentLongPress(e: WechatMiniprogram.TouchEvent) {
      const rowId = e.currentTarget.dataset.rowId as string | undefined
      if (!rowId) return
      const row = findCommentVm(this.data.comments, rowId)
      if (!row) return
      if (row.isMine !== true) {
        wx.showToast({ title: '仅可操作自己的评论', icon: 'none' })
        return
      }
      if (!row.canEditOrDeleteMine) {
        wx.showToast({ title: '已有回复，无法编辑或删除', icon: 'none' })
        return
      }
      const postId = this.data.postId
      if (!postId) return
      wx.showActionSheet({
        itemList: ['编辑', '删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            const t = typeof row.text === 'string' ? row.text : ''
            this.beginEditComment(rowId, t)
          } else if (res.tapIndex === 1) {
            wx.showModal({
              title: '删除评论',
              content: '确定删除这条评论？删除后无法恢复。',
              confirmText: '删除',
              cancelText: '取消',
              confirmColor: '#4A6670',
              success: (m) => {
                if (m.confirm) void this.runDeleteComment(postId, rowId)
              },
            })
          }
        },
      })
    },

    beginEditComment(rowId: string, text: string) {
      this.setData({
        editingCommentId: rowId,
        replyTarget: null,
        commentDraft: text,
        commentDraftIsEmpty: text.trim().length === 0,
      })
    },

    onClearReply() {
      this.setData({ replyTarget: null })
    },

    onClearEdit() {
      this.setData({
        editingCommentId: null,
        commentDraft: '',
        commentDraftIsEmpty: true,
      })
    },

    async runDeleteComment(postId: string, commentId: string) {
      this.setData({ sending: true })
      const r = await dailyDeleteComment(postId, commentId)
      this.setData({ sending: false })
      if (!r || !r.ok) {
        const errMsg = r && r.ok === false ? r.error : undefined
        wx.showToast({
          title: formatDailyCloudBizError(errMsg),
          icon: 'none',
        })
        return
      }
      const rawNext = this.data.comments
        .filter((c) => c.id !== commentId)
        .map((c) => toPlainComment(c))
      this.setData({ comments: buildCommentViewModels(rawNext), commentsMutated: true })
      wx.showToast({ title: '已删除', icon: 'success' })
    },

    onCommentDraftInput(e: WechatMiniprogram.Input) {
      const v = typeof e.detail.value === 'string' ? e.detail.value : ''
      const trimmed = v.slice(0, MAX_COMMENT_LEN)
      this.setData({
        commentDraft: trimmed,
        commentDraftIsEmpty: trimmed.trim().length === 0,
      })
    },

    async onSendTap() {
      const postId = this.data.postId
      const text = this.data.commentDraft.trim()
      const rt = this.data.replyTarget
      const editId = this.data.editingCommentId
      if (!postId || !text || this.data.sending || this.data.commentDraftIsEmpty) return
      this.setData({ sending: true })

      if (typeof editId === 'string' && editId.length > 0) {
        const r = await dailyUpdateComment(postId, editId, text)
        this.setData({ sending: false })
        if (!r || !r.ok) {
          const errMsg = r && r.ok === false ? r.error : undefined
          wx.showToast({
            title: formatDailyCloudBizError(errMsg),
            icon: 'none',
          })
          return
        }
        const rawExisting = this.data.comments.map((c) => toPlainComment(c))
        const replaced = rawExisting.map((c) => (c.id === editId ? r.comment : c))
        const merged = buildCommentViewModels(replaced)
        this.setData({
          comments: merged,
          commentDraft: '',
          commentDraftIsEmpty: true,
          editingCommentId: null,
          replyTarget: null,
          commentsMutated: true,
        })
        wx.showToast({ title: '已保存', icon: 'success' })
        return
      }

      const r = await dailyAddComment(postId, text, rt ? rt.id : undefined)
      this.setData({ sending: false })
      if (!r || !r.ok) {
        const errMsg = r && r.ok === false ? r.error : undefined
        wx.showToast({
          title: formatDailyCloudBizError(errMsg),
          icon: 'none',
        })
        return
      }
      const rawExisting = this.data.comments.map((c) => toPlainComment(c))
      const merged = buildCommentViewModels([...rawExisting, r.comment])
      this.setData({
        comments: merged,
        commentDraft: '',
        commentDraftIsEmpty: true,
        replyTarget: null,
        commentsMutated: true,
      })
    },
  },
})
