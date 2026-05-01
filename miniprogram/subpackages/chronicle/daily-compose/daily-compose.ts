import requireAuth from '../../../behaviors/require-auth'
import type { DailyPostPublic } from '../../../types/cloud'
import {
  dailyCreateDaily,
  dailyGetDaily,
  dailyUpdateDaily,
} from '../../../utils/daily-api'
import { formatDailyCloudBizError } from '../../../utils/cloud-invoke'
import { takeDailyEditStaging } from '../../../utils/daily-edit-staging'
import { uploadDailyImagesIfNeeded } from '../../../utils/daily-upload'

const MAX_IMAGES = 9

type ComposePageThis = WechatMiniprogram.Component.Instance<
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
    navTitle: '写日常',
    heroKicker: '写几句心里话，或配上今天的照片。',
    editId: '',
    /** 变化时可强制 textarea 与当前 data 对齐（解决 value 首帧后不随 setData 刷新） */
    textareaMountKey: 'compose-new',
    text: '',
    images: [] as string[],
    canSubmit: false,
  },
  /**
   * 编辑数据三条线（按可靠性排序）：
   * 1. navigate 前 sync 写入 Storage（见 daily-edit-staging），onLoad 解析 id 后读出——不依赖 EventChannel 先后。
   * 2. pageLifetimes.onLoad(options)；若 Skyline/容器未带上 query，则在 lifetimes.ready 里用 getCurrentPages().options 再试一次。
   * 3. EventChannel composeInit 仅作补充；云端 getDaily 用于校验与对齐。
   */
  lifetimes: {
    ready() {
      const self = this as ComposePageThis & {
        bootstrapEditFromQuery: (q: Record<string, string | undefined> | undefined) => boolean
      }
      if ((self.data as { editId?: string }).editId) {
        return
      }
      try {
        const pages = getCurrentPages()
        const top = pages[pages.length - 1] as { options?: Record<string, string | undefined> }
        if (top && top.options) {
          self.bootstrapEditFromQuery(top.options)
        }
      } catch {
        // ignore
      }
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      const self = this as ComposePageThis & {
        bootstrapEditFromQuery: (q: Record<string, string | undefined> | undefined) => boolean
      }

      const ch =
        typeof self.getOpenerEventChannel === 'function' ? self.getOpenerEventChannel() : null
      if (ch && typeof ch.on === 'function') {
        ch.on('composeInit', (payload: { text?: string; images?: string[] }) => {
          const text = typeof payload.text === 'string' ? payload.text : ''
          const images = Array.isArray(payload.images) ? payload.images.slice(0, MAX_IMAGES) : []
          const canSubmit = text.trim().length > 0 || images.length > 0
          const editId = (self.data as { editId?: string }).editId || ''
          self.setData({
            text,
            images,
            canSubmit,
            textareaMountKey: `${editId || 'new'}-ec-${Date.now()}`,
          })
        })
      }

      self.bootstrapEditFromQuery(options)
    },
  },
  methods: {
    /**
     * 解析 ?id= ，合并跳转前 sync 暂存的正文与配图，再异步拉云端对齐。
     */
    bootstrapEditFromQuery(query: Record<string, string | undefined> | undefined): boolean {
      if (!query || typeof query !== 'object') {
        return false
      }
      const rawId = query.id
      if (!rawId || typeof rawId !== 'string') {
        return false
      }
      let id: string
      try {
        id = decodeURIComponent(rawId)
      } catch {
        return false
      }
      if (!id) {
        return false
      }

      const ext = this as WechatMiniprogram.IAnyObject
      if (ext._dailyComposeBootstrappedId === id) {
        return true
      }

      const staged = takeDailyEditStaging(id)
      const patch: WechatMiniprogram.IAnyObject = {
        editId: id,
        navTitle: '编辑日常',
        heroKicker: '修改正文或配图，保存后见证列表会同步更新。',
        textareaMountKey: `${id}-boot-${Date.now()}`,
      }
      if (staged) {
        patch.text = staged.text
        patch.images = staged.images.slice(0, MAX_IMAGES)
        patch.canSubmit =
          staged.text.trim().length > 0 || staged.images.length > 0
      }

      this.setData(patch)
      ext._dailyComposeBootstrappedId = id

      wx.nextTick(() => {
        void this.loadEditDraft(id)
      })
      return true
    },

    async loadEditDraft(id: string) {
      if (!wx.cloud) {
        wx.showToast({ title: '云开发不可用', icon: 'none' })
        return
      }
      wx.showLoading({ title: '加载中', mask: true })
      try {
        const r = await dailyGetDaily(id)
        if (!r || !r.ok || !r.post) {
          const hadLocal =
            ((this.data as { text?: string }).text || '').trim().length > 0 ||
            (((this.data as { images?: string[] }).images) || []).length > 0
          if (!hadLocal) {
            wx.showToast({
              title: r && !r.ok ? formatDailyCloudBizError(r.error) : '加载失败',
              icon: 'none',
            })
          }
          return
        }
        const p = r.post
        if (!p.isMine) {
          wx.showToast({ title: '只能编辑自己的日常', icon: 'none' })
          setTimeout(() => {
            wx.navigateBack({
              fail: () => {
                wx.switchTab({ url: '/pages/chronicle/chronicle' })
              },
            })
          }, 600)
          return
        }
        const text = typeof p.snippet === 'string' ? p.snippet : ''
        const images = Array.isArray(p.images) ? p.images.slice(0, MAX_IMAGES) : []
        const canSubmit = text.trim().length > 0 || images.length > 0
        this.setData({
          text,
          images,
          canSubmit,
          textareaMountKey: `${id}-cloud-${Date.now()}`,
        })
      } finally {
        wx.hideLoading()
      }
    },

    syncCanSubmit() {
      const { text, images } = this.data as { text: string; images: string[] }
      const ok = text.trim().length > 0 || images.length > 0
      if (ok !== this.data.canSubmit) {
        this.setData({ canSubmit: ok })
      }
    },

    onTextInput(e: WechatMiniprogram.Input) {
      const v = e.detail.value || ''
      const images = (this.data as { images: string[] }).images
      const ok = v.trim().length > 0 || images.length > 0
      if (ok !== this.data.canSubmit) {
        this.setData({ canSubmit: ok })
      }
    },

    onAddImagesFromAlbum() {
      const ext = this as unknown as { _skipAlbumTapUntil?: number }
      if (Date.now() < (ext._skipAlbumTapUntil || 0)) return
      this.pickImages(['album'])
    },

    /** 长按：仅调起相机；短时屏蔽随后的 tap，避免与相册重复弹出 */
    onAddImagesFromCamera() {
      const ext = this as unknown as { _skipAlbumTapUntil?: number }
      ext._skipAlbumTapUntil = Date.now() + 480
      this.pickImages(['camera'], 1)
    },

    /**
     * @param maxCount 单次可选张数；相册为剩余槽位，相机固定 1
     */
    pickImages(sourceType: Array<'album' | 'camera'>, maxCount?: number) {
      const { images } = this.data as { images: string[] }
      const remain = MAX_IMAGES - images.length
      if (remain <= 0) return
      const count = maxCount != null ? Math.min(maxCount, remain) : remain
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType,
        success: (res) => {
          const next = res.tempFiles.map((f) => f.tempFilePath)
          this.setData({
            images: [...images, ...next].slice(0, MAX_IMAGES),
          })
          this.syncCanSubmit()
        },
      })
    },

    onRemoveImage(e: WechatMiniprogram.TouchEvent) {
      const idx = Number(e.currentTarget.dataset.index)
      if (Number.isNaN(idx)) return
      const images = [...(this.data as { images: string[] }).images]
      images.splice(idx, 1)
      this.setData({ images })
      this.syncCanSubmit()
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/chronicle/chronicle' })
        },
      })
    },

    async onPublish() {
      if (!this.data.canSubmit) {
        wx.showToast({ title: '写点什么或选一张图吧', icon: 'none' })
        return
      }
      const { text, images, editId } = this.data as {
        text: string
        images: string[]
        editId: string
      }
      const snippet = text.trim()
      wx.showLoading({ title: editId ? '保存中' : '发布中', mask: true })
      try {
        let fileIds: string[]
        try {
          fileIds = await uploadDailyImagesIfNeeded(images)
        } catch (e) {
          const msg = e instanceof Error ? e.message : '图片上传失败'
          wx.showToast({ title: msg, icon: 'none' })
          return
        }
        const id = editId
        const result = id
          ? await dailyUpdateDaily(id, snippet, fileIds)
          : await dailyCreateDaily(snippet, fileIds)
        if (!result) return
        if (!result.ok) {
          wx.showToast({ title: formatDailyCloudBizError(result.error), icon: 'none' })
          return
        }
        if (!result.post) {
          wx.showToast({ title: '保存失败', icon: 'none' })
          return
        }
        const post: DailyPostPublic = result.post
        const self = this as ComposePageThis
        const ch = typeof self.getOpenerEventChannel === 'function' ? self.getOpenerEventChannel() : null
        if (ch && typeof ch.emit === 'function') {
          ch.emit('dailyPublished', {
            mode: id ? 'edit' : 'create',
            post,
          })
        }
        wx.showToast({ title: id ? '已保存修改' : '发布成功', icon: 'success', duration: 900 })
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: '/pages/chronicle/chronicle' })
            },
          })
        }, 320)
      } finally {
        wx.hideLoading()
      }
    },
  },
})
