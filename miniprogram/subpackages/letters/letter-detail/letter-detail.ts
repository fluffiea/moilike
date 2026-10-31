import requireAuth from '../../../behaviors/require-auth'
import { lettersGet, lettersGetMediaTempURLs } from '../../../utils/api/letter-api'
import { formatCloudBizError } from '../../../utils/cloud-invoke'
import { imageIndexFromDataset, previewImagesAt } from '../../../utils/image-preview'
import { PAGE_LETTER_COMPOSE } from '../../../constants/paths'
import type { LetterPublic } from '../../../types/cloud-letter'
import moSession from '../../../utils/session'

/** 类型徽标文案（纯文字，不用 emoji：部分机型缺 emoji 字体会显示成方框） */
const TYPE_LABELS: Record<string, string> = {
  confession: '\u8868\u767D',
  apology: '\u9053\u6B49',
  thankyou: '\u611F\u8C22',
  wish: '\u8BB8\u613F',
  whisper: '\u6084\u6084\u8BDD',
}

type LetterDetailData = {
  letterId: string
  loading: boolean
  letter: LetterPublic | null
  senderName: string
  receiverName: string
  typeLabel: string
  images: string[]
  paperOpen: boolean
}

type LetterDetailMethods = WechatMiniprogram.Component.MethodOption

function makeTypeLabel(type: string): string {
  const label = TYPE_LABELS[type]
  if (label) return label
  return type.length > 8 ? type.slice(0, 8) + '\u2026' : type
}

Component<LetterDetailData, {}, LetterDetailMethods, {}>({
  behaviors: [requireAuth],
  data: {
    letterId: '',
    loading: true,
    letter: null,
    senderName: '',
    receiverName: '',
    typeLabel: '',
    images: [],
    paperOpen: false,
  },
  lifetimes: {
    ready() {
      if (this.data.letterId) return
      try {
        const pages = getCurrentPages()
        const top = pages[pages.length - 1] as { options?: Record<string, string | undefined> }
        if (top && top.options) {
          this.applyLetterId(top.options)
        }
      } catch {
        // ignore
      }
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      this.applyLetterId(options)
    },
  },
  methods: {
    applyLetterId(options: Record<string, string | undefined> | undefined) {
      const raw = options && typeof options.id === 'string' ? options.id : ''
      let id = raw.trim()
      if (id) {
        try {
          id = decodeURIComponent(id)
        } catch {
          // keep id
        }
      }
      this.setData({ letterId: id })
      if (!id) {
        wx.showToast({ title: '缺少信件参数', icon: 'none' })
        this.setData({ loading: false })
        return
      }
      void this.loadLetter()
    },

    async loadLetter() {
      const letterId = this.data.letterId
      if (!letterId) return
      this.setData({ loading: true })
      const r = await lettersGet(letterId)
      if (!r || !r.ok || !r.letter) {
        wx.showToast({
          title: r && r.ok === false ? formatCloudBizError(r.error) : '加载失败',
          icon: 'none',
        })
        this.setData({ letter: null, loading: false })
        return
      }

      const letter = r.letter
      const images = Array.isArray(letter.images) ? letter.images : []

      // 获取用户名称
      const u = moSession.loadMoUser()
      const myName = u && u.nickName ? u.nickName : '我'
      const partnerName = u && u.partner && u.partner.nickName ? u.partner.nickName : '对方'

      const senderName = letter.isMine ? myName : partnerName
      const receiverName = letter.isMine ? partnerName : myName

      this.setData({
        letter,
        loading: false,
        senderName,
        receiverName,
        typeLabel: makeTypeLabel(letter.type),
        images,
      })

      // 延迟一帧触发入场动画
      setTimeout(() => {
        this.setData({ paperOpen: true })
      }, 50)
    },

    onNavBack() {
      wx.navigateBack({ fail: () => {} })
    },

    /** 写回信：带上原信类型，写信页会预选 */
    onReply() {
      const letter = this.data.letter
      const type = letter && typeof letter.type === 'string' ? letter.type.trim() : ''
      const url =
        PAGE_LETTER_COMPOSE + '?reply=1' + (type ? '&type=' + encodeURIComponent(type) : '')
      wx.navigateTo({
        url,
        fail: () => {
          wx.showToast({ title: '跳转失败', icon: 'none' })
        },
      })
    },

    async onImageTap(e: WechatMiniprogram.TouchEvent) {
      const images = this.data.images
      if (!images || images.length === 0) return
      const dataset = e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset : undefined
      const idx = imageIndexFromDataset(dataset ? dataset.index : undefined)
      if (typeof images[idx] !== 'string' || images[idx].length === 0) return

      // 将 cloud:// 文件 ID 转为临时链接（否则 wx.previewImage 可能无法展示云存储文件）
      const r = await lettersGetMediaTempURLs(images)
      const tempUrls = r && r.ok && r.urls ? images.map((u) => r.urls[u] || u) : images
      previewImagesAt(tempUrls, idx)
    },
  },
})
