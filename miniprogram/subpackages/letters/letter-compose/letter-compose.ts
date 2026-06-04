import requireAuth from '../../../behaviors/require-auth'
import { letterCreate } from '../../../utils/api/letter-api'
import { uploadLetterImagesIfNeeded } from '../../../utils/upload/letter-upload'
import moSession from '../../../utils/session'
import { PAGE_LETTER_LIST } from '../../../constants/paths'

const MAX_IMAGES = 9
const MAX_TITLE = 200
const MAX_CONTENT = 5000

type TypeRow = { name: string; label: string; selected: boolean }

/** 预置信件类型 */
const PRESET_TYPES: { name: string; label: string }[] = [
  { name: 'confession', label: '💌 表白信' },
  { name: 'apology', label: '🙏 道歉信' },
  { name: 'thankyou', label: '❤️ 感谢信' },
  { name: 'wish', label: '✨ 许愿信' },
  { name: 'whisper', label: '🤫 悄悄话' },
  { name: '_custom', label: '✏️ 自定义' },
]

type LetterComposeData = {
  navTitle: string
  heroKicker: string
  textareaMountKey: string
  title: string
  content: string
  images: string[]
  imageDisplays: string[]
  canSubmit: boolean
  typeRows: TypeRow[]
  selectedType: string
  showCustomTypeInput: boolean
  customTypeValue: string
  resolvedType: string
  receiverName: string
}

interface LetterComposeCustomInstanceProperty {
  _skipAlbumTapUntil: number
}

type LetterComposeMethods = WechatMiniprogram.Component.MethodOption

function bizErrMsg(r: { ok?: boolean; error?: string } | null | undefined): string {
  if (r && r.ok === false) return r.error || '操作失败'
  return '操作失败'
}

Component<LetterComposeData, {}, LetterComposeMethods, LetterComposeCustomInstanceProperty>({
  behaviors: [requireAuth],
  data: {
    navTitle: '写信',
    heroKicker: '写一封信，投递到对方的心底。',
    textareaMountKey: 'letter-new',
    title: '',
    content: '',
    images: [],
    imageDisplays: [],
    canSubmit: false,
    typeRows: [],
    selectedType: '',
    showCustomTypeInput: false,
    customTypeValue: '',
    resolvedType: '',
    receiverName: '',
  },
  lifetimes: {
    attached() {
      this.buildTypeRows()
      this.loadReceiverName()
    },
  },
  pageLifetimes: {
    onLoad() {
      // no-op
    },
  },
  methods: {
    loadReceiverName() {
      const u = moSession.loadMoUser()
      const name =
        u && u.partner && u.partner.nickName ? u.partner.nickName : '对方'
      if (name !== this.data.receiverName) {
        this.setData({ receiverName: name, heroKicker: '写一封信给 ' + name + '，投递到 ta 的心底。' })
      }
    },

    buildTypeRows() {
      const rows: TypeRow[] = PRESET_TYPES.map((t) => ({
        name: t.name,
        label: t.label,
        selected: t.name === 'whisper',
      }))
      this.setData({
        typeRows: rows,
        selectedType: 'whisper',
        resolvedType: 'whisper',
      })
    },

    rebuildTypeRows() {
      const rows: TypeRow[] = this.data.typeRows.map((r) => ({
        ...r,
        selected: r.name === this.data.selectedType,
      }))
      this.setData({ typeRows: rows })
    },

    onToggleType(e: WechatMiniprogram.TouchEvent) {
      const name = e.currentTarget.dataset.name as string | undefined
      if (!name || typeof name !== 'string') return
      if (name === '_custom') {
        this.setData({
          selectedType: '_custom',
          showCustomTypeInput: true,
          resolvedType: '',
          customTypeValue: '',
        })
        this.rebuildTypeRows()
        this.syncCanSubmit()
        return
      }
      this.setData({
        selectedType: name,
        resolvedType: name,
        showCustomTypeInput: false,
        customTypeValue: '',
      })
      this.rebuildTypeRows()
      this.syncCanSubmit()
    },

    onCustomTypeInput(e: WechatMiniprogram.Input) {
      this.setData({ customTypeValue: e.detail.value || '' })
    },

    onCustomTypeConfirm() {
      const raw = (this.data.customTypeValue || '').trim()
      if (raw) {
        this.setData({ resolvedType: raw })
        this.syncCanSubmit()
      }
    },

    onTitleInput(e: WechatMiniprogram.Input) {
      this.setData({ title: e.detail.value || '' })
    },

    onContentInput() {
      this.syncCanSubmit()
    },

    syncCanSubmit() {
      const ok = this.data.content.trim().length > 0
      if (ok !== this.data.canSubmit) this.setData({ canSubmit: ok })
    },

    onAddImagesFromAlbum() {
      if (Date.now() < this._skipAlbumTapUntil) return
      this.pickImages(['album'])
    },

    onAddImagesFromCamera() {
      this._skipAlbumTapUntil = Date.now() + 480
      this.pickImages(['camera'], 1)
    },

    pickImages(sourceType: Array<'album' | 'camera'>, maxCount?: number) {
      const remain = MAX_IMAGES - this.data.images.length
      if (remain <= 0) return
      const count = maxCount != null ? Math.min(maxCount, remain) : remain
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType,
        success: (res) => {
          const next = res.tempFiles.map((f) => f.tempFilePath)
          const merged = [...this.data.images, ...next].slice(0, MAX_IMAGES)
          const mergedD = [...this.data.imageDisplays, ...next].slice(0, MAX_IMAGES)
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
          wx.redirectTo({ url: PAGE_LETTER_LIST })
        },
      })
    },

    async onSubmit() {
      if (!this.data.canSubmit) {
        wx.showToast({ title: '请先写点内容', icon: 'none' })
        return
      }

      const u = moSession.loadMoUser()
      const receiverId = u && u.partnerOpenId ? u.partnerOpenId : ''
      if (!receiverId) {
        wx.showToast({ title: '尚未绑定伴侣', icon: 'none' })
        return
      }

      const content = this.data.content.trim().slice(0, MAX_CONTENT)
      const title = this.data.title.trim().slice(0, MAX_TITLE)
      let type = this.data.resolvedType
      if (!type) {
        type = this.data.selectedType === '_custom' ? (this.data.customTypeValue || '').trim() : this.data.selectedType
      }
      if (!type) {
        type = 'whisper'
      }

      wx.showLoading({ title: '寄出中', mask: true })
      try {
        let fileIds: string[]
        try {
          fileIds = await uploadLetterImagesIfNeeded(this.data.images)
        } catch (e) {
          const msg = e instanceof Error ? e.message : '图片上传失败'
          wx.showToast({ title: msg, icon: 'none' })
          return
        }

        const result = await letterCreate(title, content, type, fileIds, receiverId)
        if (!result) return
        if (!result.ok) {
          wx.showToast({ title: bizErrMsg(result), icon: 'none' })
          return
        }

        const ch = this.getOpenerEventChannel()
        if (ch && typeof ch.emit === 'function') {
          ch.emit('letterSent', {})
        }

        wx.showToast({ title: '信已寄出 💌', icon: 'success', duration: 900 })
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.redirectTo({ url: PAGE_LETTER_LIST })
            },
          })
        }, 320)
      } finally {
        wx.hideLoading()
      }
    },
  },
})
