import requireAuth from '../../../behaviors/require-auth'
import type { LetterPublic } from '../../../types/cloud-letter'
import { lettersGet } from '../../../utils/api/letter-api'
import { formatCloudBizError } from '../../../utils/cloud-invoke'
import moSession from '../../../utils/session'
import { resolveAvatarForDisplay, DEFAULT_AVATAR_PATH } from '../../../utils/display/avatar-display'

type LetterDetailPageData = {
  letterId: string
  navTitle: string
  loading: boolean
  opened: boolean
  letter: LetterPublic | null
  senderName: string
  receiverName: string
  senderAvatar: string
  receiverAvatar: string
  /** 信件类型对应的色调 class suffix */
  typeTone: string
}

type LetterDetailMethods = WechatMiniprogram.Component.MethodOption

let _avatarResolvePending = false

Component<LetterDetailPageData, {}, LetterDetailMethods>({
  behaviors: [requireAuth],
  data: {
    letterId: '',
    navTitle: '信',
    loading: true,
    opened: false,
    letter: null,
    senderName: '',
    receiverName: '',
    senderAvatar: DEFAULT_AVATAR_PATH,
    receiverAvatar: DEFAULT_AVATAR_PATH,
    typeTone: 'letter-teal',
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
      const id =
        options && typeof options.id === 'string' ? options.id.trim() : ''
      this.setData({ letterId: id })
      if (!id) {
        wx.showToast({ title: '缺少信件参数', icon: 'none' })
        this.setData({ loading: false })
        return
      }
      void this.loadLetter()
    },

    async loadLetter() {
      const id = this.data.letterId
      if (!id) return
      this.setData({ loading: true })
      const gr = await lettersGet(id)
      if (!gr || !gr.ok) {
        const errMsg = gr && gr.ok === false ? gr.error : undefined
        this.setData({ loading: false, letter: null })
        wx.showToast({
          title: formatCloudBizError(errMsg),
          icon: 'none',
        })
        return
      }

      const letter = gr.letter
      const user = moSession.loadMoUser()

      let senderName = ''
      let receiverName = ''
      const senderAvatar = DEFAULT_AVATAR_PATH
      const receiverAvatar = DEFAULT_AVATAR_PATH

      if (user) {
        if (letter.isMine) {
          senderName = user.nickName || '我'
          const p = user.partner
          receiverName = p && p.nickName ? p.nickName : 'Ta'
        } else {
          const p = user.partner
          senderName = p && p.nickName ? p.nickName : 'Ta'
          receiverName = user.nickName || '我'
        }
      } else {
        senderName = letter.isMine ? '我' : '对方'
        receiverName = letter.isMine ? '对方' : '我'
      }

      // Resolve avatars asynchronously if available
      void this.resolveAvatars(letter, user)

      const typeTone = this.resolveTypeTone(letter.type)

      this.setData({
        letter,
        senderName,
        receiverName,
        senderAvatar,
        receiverAvatar,
        typeTone,
        loading: false,
        navTitle: letter.title || '信',
      })

      // Trigger unfolding animation after a short delay for DOM paint
      setTimeout(() => {
        this.setData({ opened: true })
      }, 100)
    },

    resolveTypeTone(type: string): string {
      switch (type) {
        case 'image':
          return 'letter-rose'
        case 'voice':
          return 'letter-sage'
        default:
          return 'letter-teal'
      }
    },

    async resolveAvatars(letter: LetterPublic, user: ReturnType<typeof moSession.loadMoUser>) {
      if (_avatarResolvePending) return
      _avatarResolvePending = true
      try {
        if (!user) return
        let senderRef = ''
        let receiverRef = ''
        if (letter.isMine) {
          senderRef = user.avatarUrl || ''
          const p = user.partner
          receiverRef = p && p.avatarUrl ? p.avatarUrl : ''
        } else {
          const p = user.partner
          senderRef = p && p.avatarUrl ? p.avatarUrl : ''
          receiverRef = user.avatarUrl || ''
        }
        const [sa, ra] = await Promise.all([
          resolveAvatarForDisplay(senderRef),
          resolveAvatarForDisplay(receiverRef),
        ])
        this.setData({
          senderAvatar: sa || DEFAULT_AVATAR_PATH,
          receiverAvatar: ra || DEFAULT_AVATAR_PATH,
        })
      } finally {
        _avatarResolvePending = false
      }
    },

    onNavBack() {
      wx.navigateBack({ fail: () => {} })
    },

    onImageTap(e: WechatMiniprogram.TouchEvent) {
      const letter = this.data.letter
      if (!letter || !letter.images || letter.images.length === 0) return
      const rawIdx = e.currentTarget.dataset.imgIndex
      let imgIndex = 0
      if (rawIdx !== undefined && rawIdx !== null && rawIdx !== '') {
        const n = Number(rawIdx)
        if (!Number.isNaN(n)) imgIndex = Math.floor(n)
      }
      const urls = letter.images
      const max = urls.length - 1
      let idx = imgIndex
      if (idx < 0) idx = 0
      if (idx > max) idx = max
      const cur = urls[idx]
      if (typeof cur !== 'string' || cur.length === 0) return
      wx.previewImage({ current: cur, urls })
    },
  },
})
