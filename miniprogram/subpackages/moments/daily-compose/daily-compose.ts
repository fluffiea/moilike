import requireAuth from '../../../behaviors/require-auth'
import type { DailyPostPublic } from '../../../types/cloud'
import {
  dailyCreateDaily,
  dailyGetDaily,
  dailyMapMediaTempUrls,
  dailyUpdateDaily,
} from '../../../utils/api/daily-api'
import { formatCloudBizError } from '../../../utils/cloud-invoke'
import { takeDailyEditStaging } from '../../../utils/daily-edit-staging'
import { uploadDailyImagesIfNeeded } from '../../../utils/upload/daily-upload'
import { TAB_MOMENTS } from '../../../constants/paths'
import { MAX_POST_IMAGES } from '../../../constants/limits'

/** 提交用 fileID / 本地临时路径；与 imageDisplays 等长，缩略图可为临时 HTTPS */
type ComposeData = {
  navTitle: string
  heroKicker: string
  editId: string
  textareaMountKey: string
  text: string
  images: string[]
  imageDisplays: string[]
  canSubmit: boolean
}

interface ComposeCustomInstanceProperty {
  _dailyComposeBootstrappedId: string
  _skipAlbumTapUntil: number
}

type ComposeMethods = WechatMiniprogram.Component.MethodOption

Component<ComposeData, {}, ComposeMethods, ComposeCustomInstanceProperty>({
  behaviors: [requireAuth],
  data: {
    navTitle: '写日常',
    heroKicker: '写几句心里话，或配上今天的照片。',
    editId: '',
    textareaMountKey: 'compose-new',
    text: '',
    images: [],
    imageDisplays: [],
    canSubmit: false,
  },
  lifetimes: {
    ready() {
      if (this.data.editId) return
      this.consumeDailyCameraPrefill()
      try {
        const pages = getCurrentPages()
        const top = pages[pages.length - 1] as { options?: Record<string, string | undefined> }
        if (top && top.options) {
          this.bootstrapEditFromQuery(top.options)
        }
      } catch {
        // ignore
      }
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      this.bootstrapEditFromQuery(options)
    },
  },
  methods: {
    consumeDailyCameraPrefill() {
      const imagePath = wx.getStorageSync('moilike_daily_camera_prefill')
      if (typeof imagePath === 'string' && imagePath) {
        wx.removeStorageSync('moilike_daily_camera_prefill')
        const cur = this.data.images
        if (cur.length < MAX_POST_IMAGES) {
          this.setData({
            images: [...cur, imagePath],
            imageDisplays: [...this.data.imageDisplays, imagePath],
          })
          this.syncCanSubmit()
        }
      }
    },

    /**
     * 解析 ?id= ，合并跳转前 Storage 暂存的正文与配图，再异步拉云端对齐。
     */
    bootstrapEditFromQuery(query: Record<string, string | undefined> | undefined): boolean {
      if (!query || typeof query !== 'object') return false
      const rawId = query.id
      if (!rawId || typeof rawId !== 'string') return false
      let id: string
      try {
        id = decodeURIComponent(rawId)
      } catch {
        return false
      }
      if (!id) return false

      if (this._dailyComposeBootstrappedId === id) return true

      const staged = takeDailyEditStaging(id)
      const patch: WechatMiniprogram.IAnyObject = {
        editId: id,
        navTitle: '编辑日常',
        heroKicker: '修改正文或配图，保存后浮生列表会同步更新。',
        textareaMountKey: `${id}-boot-${Date.now()}`,
      }
      if (staged) {
        patch.text = staged.text
        const onlyCloud = staged.images.filter(
          (u) => typeof u === 'string' && u.indexOf('cloud://') === 0,
        )
        if (onlyCloud.length > 0) {
          const imgs = onlyCloud.slice(0, MAX_POST_IMAGES)
          patch.images = imgs
          patch.imageDisplays = imgs.slice()
        }
        const im = (patch.images as string[]) || []
        patch.canSubmit = staged.text.trim().length > 0 || im.length > 0
      }

      this.setData(patch)
      this._dailyComposeBootstrappedId = id

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
          if ((this.data.text || '').trim().length === 0 && (!this.data.images || this.data.images.length === 0)) {
            wx.showToast({
              title: r && !r.ok ? formatCloudBizError(r.error) : '加载失败',
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
                wx.switchTab({ url: TAB_MOMENTS })
              },
            })
          }, 600)
          return
        }
        const text = typeof p.snippet === 'string' ? p.snippet : ''
        const imagesRaw = Array.isArray(p.images) ? p.images.slice(0, MAX_POST_IMAGES) : []
        const mediaMap = await dailyMapMediaTempUrls(imagesRaw)
        const imageDisplays = imagesRaw.map((img) =>
          typeof img === 'string' ? mediaMap.get(img) || img : img,
        )
        const canSubmit = text.trim().length > 0 || imagesRaw.length > 0
        this.setData({
          text,
          images: imagesRaw,
          imageDisplays,
          canSubmit,
          textareaMountKey: `${id}-cloud-${Date.now()}`,
        })
      } finally {
        wx.hideLoading()
      }
    },

    syncCanSubmit() {
      const ok = this.data.text.trim().length > 0 || this.data.images.length > 0
      if (ok !== this.data.canSubmit) this.setData({ canSubmit: ok })
    },

    onTextInput(e: WechatMiniprogram.Input) {
      const v = e.detail.value || ''
      const ok = v.trim().length > 0 || this.data.images.length > 0
      if (ok !== this.data.canSubmit) this.setData({ canSubmit: ok })
    },

    onAddImagesFromAlbum() {
      if (Date.now() < this._skipAlbumTapUntil) return
      this.pickImages(['album'])
    },

    /** 长按：仅调起相机；短时屏蔽随后的 tap，避免与相册重复弹出 */
    onAddImagesFromCamera() {
      this._skipAlbumTapUntil = Date.now() + 480
      this.pickImages(['camera'], 1)
    },

    /**
     * @param maxCount 单次可选张数；相册为剩余槽位，相机固定 1
     */
    pickImages(sourceType: Array<'album' | 'camera'>, maxCount?: number) {
      const remain = MAX_POST_IMAGES - this.data.images.length
      if (remain <= 0) return
      const count = maxCount != null ? Math.min(maxCount, remain) : remain
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType,
        success: (res) => {
          const next = res.tempFiles.map((f) => f.tempFilePath)
          const merged = [...this.data.images, ...next].slice(0, MAX_POST_IMAGES)
          const mergedD = [...this.data.imageDisplays, ...next].slice(0, MAX_POST_IMAGES)
          this.setData({
            images: merged,
            imageDisplays: mergedD,
          })
          this.syncCanSubmit()
        },
      })
    },

    onRemoveImage(e: WechatMiniprogram.TouchEvent) {
      const idx = Number(e.currentTarget.dataset.index)
      if (Number.isNaN(idx)) return
      const images = [...this.data.images]
      const imageDisplays = [...this.data.imageDisplays]
      images.splice(idx, 1)
      imageDisplays.splice(idx, 1)
      this.setData({ images, imageDisplays })
      this.syncCanSubmit()
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_MOMENTS })
        },
      })
    },

    async onPublish() {
      if (!this.data.canSubmit) {
        wx.showToast({ title: '写点什么或选一张图吧', icon: 'none' })
        return
      }
      const { text, images, editId } = this.data
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
        const result = editId
          ? await dailyUpdateDaily(editId, snippet, fileIds)
          : await dailyCreateDaily(snippet, fileIds)
        if (!result) return
        if (!result.ok) {
          wx.showToast({ title: formatCloudBizError(result.error), icon: 'none' })
          return
        }
        if (!result.post) {
          wx.showToast({ title: '保存失败', icon: 'none' })
          return
        }
        const post: DailyPostPublic = result.post
        const ch = this.getOpenerEventChannel()
        if (ch && typeof ch.emit === 'function') {
          ch.emit('dailyPublished', {
            mode: editId ? 'edit' : 'create',
            post,
          })
        }
        wx.showToast({ title: editId ? '已保存修改' : '发布成功', icon: 'success', duration: 900 })
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: TAB_MOMENTS })
            },
          })
        }, 320)
      } finally {
        wx.hideLoading()
      }
    },
  },
})
