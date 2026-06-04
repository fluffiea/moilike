import requireAuth from '../../../behaviors/require-auth'
import { lettersGet } from '../../../utils/api/letter-api'
import type { LetterPublic } from '../../../types/cloud-letter'
import moSession from '../../../utils/session'

/** 类型徽标文案 */
const TYPE_LABELS: Record<string, string> = {
  confession: '\u{1F48C} 表白',
  apology: '\u{1F64F} 道歉',
  thankyou: '\u2764\uFE0F 感谢',
  wish: '\u2728 许愿',
  whisper: '\u{1F92B} 悄悄话',
}

/** 类型对应 CSS class 后缀 */
const TYPE_CLASSES: Record<string, string> = {
  confession: 'confession',
  apology: 'apology',
  thankyou: 'thankyou',
  wish: 'wish',
  whisper: 'whisper',
}

type LetterDetailData = {
  letterId: string
  loading: boolean
  letter: LetterPublic | null
  senderName: string
  receiverName: string
  typeLabel: string
  typeClass: string
  images: string[]
  paperOpen: boolean
}

type LetterDetailMethods = WechatMiniprogram.Component.MethodOption

function makeTypeLabel(type: string): string {
  const label = TYPE_LABELS[type]
  if (label) return label
  return type.length > 8 ? type.slice(0, 8) + '\u2026' : type
}

function makeTypeClass(type: string): string {
  const cls = TYPE_CLASSES[type]
  if (cls) return cls
  return 'default'
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
    typeClass: 'default',
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
          title: r && r.ok === false ? (r.error || '加载失败') : '加载失败',
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
        typeClass: makeTypeClass(letter.type),
        images,
      })

      // 延迟一帧触发信纸展开动画
      setTimeout(() => {
        this.setData({ paperOpen: true })
      }, 50)
    },

    onNavBack() {
      wx.navigateBack({ fail: () => {} })
    },

    onImageTap(e: WechatMiniprogram.TouchEvent) {
      const images = this.data.images
      if (!images || images.length === 0) return
      const rawIdx = e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.index : undefined
      let imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const urls = images
      const max = urls.length - 1
      const idx = imgIndex < 0 ? 0 : imgIndex > max ? max : imgIndex
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({ current: cur, urls })
    },
  },
})
