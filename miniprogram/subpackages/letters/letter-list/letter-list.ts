import requireAuth from '../../../behaviors/require-auth'
import { lettersList } from '../../../utils/api/letter-api'
import moSession from '../../../utils/session'
import { PAGE_LETTER_COMPOSE, PAGE_LETTER_DETAIL } from '../../../constants/paths'

const PAGE_SIZE = 20

/** 预置信件类型映射 */
const TYPE_LABELS: Record<string, string> = {
  confession: '\u{1F48C} 表白',
  apology: '\u{1F64F} 道歉',
  thankyou: '\u2764\uFE0F 感谢',
  wish: '\u2728 许愿',
  whisper: '\u{1F92B} 悄悄话',
}

type LetterDisplayItem = {
  id: string
  title: string
  preview: string
  typeLabel: string
  thumbImages: string[]
  time: string
  isMine: boolean
  senderName: string
  receiverName: string
  directionText: string
}

type LetterListData = {
  loading: boolean
  list: LetterDisplayItem[]
  loadingMore: boolean
  hasMore: boolean
  offset: number
}

type LetterListMethods = WechatMiniprogram.Component.MethodOption

function makeTypeLabel(type: string): string {
  const label = TYPE_LABELS[type]
  if (label) return label
  return type.length > 8 ? type.slice(0, 8) + '\u2026' : type
}

function makePreview(content: string): string {
  const t = content.trim().replace(/\s+/g, ' ')
  return t.length > 120 ? t.slice(0, 117) + '\u2026' : t
}

function makeThumbImages(images: string[]): string[] {
  if (!Array.isArray(images) || images.length === 0) return []
  return images.slice(0, 3)
}

Component<LetterListData, {}, LetterListMethods, {}>({
  behaviors: [requireAuth],
  data: {
    loading: true,
    list: [],
    loadingMore: false,
    hasMore: true,
    offset: 0,
  },
  lifetimes: {
    attached() {
      void this.loadList(0, true)
    },
  },
  pageLifetimes: {
    show() {
      // 从写信页返回时刷新列表
      if (!this.data.loading && !this.data.loadingMore) {
        void this.loadList(0, true)
      }
    },
  },
  methods: {
    async loadList(offset: number, replace: boolean) {
      const isLoadingMore = !replace
      if (isLoadingMore) {
        this.setData({ loadingMore: true })
      } else {
        this.setData({ loading: true })
      }

      try {
        const r = await lettersList(offset)
        if (!r) {
          if (replace) this.setData({ list: [] })
          this.setData({ hasMore: false, loading: false, loadingMore: false })
          wx.showToast({ title: '加载失败', icon: 'none' })
          return
        }
        if (!r.ok || !Array.isArray(r.list)) {
          if (replace) this.setData({ list: [] })
          this.setData({ hasMore: false })
          wx.showToast({ title: r && r.ok === false ? (r.error || '加载失败') : '加载失败', icon: 'none' })
          return
        }

        const u = moSession.loadMoUser()
        const myName = u && u.nickName ? u.nickName : '\u6211'
        const partnerName = u && u.partner && u.partner.nickName ? u.partner.nickName : '\u5BF9\u65B9'

        const items: LetterDisplayItem[] = r.list.map((doc) => ({
          id: doc.id,
          title: doc.title || '',
          preview: makePreview(doc.content),
          typeLabel: makeTypeLabel(doc.type),
          thumbImages: makeThumbImages(doc.images),
          time: doc.time,
          isMine: doc.isMine === true,
          senderName: doc.isMine ? myName : partnerName,
          receiverName: doc.isMine ? partnerName : myName,
          directionText: doc.isMine ? '→ ' + partnerName : '← ' + myName,
        }))

        if (replace) {
          this.setData({ list: items, offset: r.nextOffset, hasMore: r.hasMore })
        } else {
          this.setData({
            list: [...this.data.list, ...items],
            offset: r.nextOffset,
            hasMore: r.hasMore,
          })
        }
      } finally {
        this.setData({ loading: false, loadingMore: false })
      }
    },

    onLoadMore() {
      if (!this.data.hasMore || this.data.loadingMore || this.data.loading) return
      void this.loadList(this.data.offset, false)
    },

    onGoCompose() {
      wx.navigateTo({
        url: PAGE_LETTER_COMPOSE,
        fail: () => {
          wx.showToast({ title: '\u8DF3\u8F6C\u5931\u8D25', icon: 'none' })
        },
      })
    },

    onGoDetail(e: WechatMiniprogram.TouchEvent) {
      const dataset = e.currentTarget && e.currentTarget.dataset
      const raw = dataset && typeof dataset.id === 'string' ? dataset.id : ''
      const id = raw.trim()
      if (!id) return
      wx.navigateTo({
        url: PAGE_LETTER_DETAIL + '?id=' + encodeURIComponent(id),
        fail: () => {
          wx.showToast({ title: '\u8DF3\u8F6C\u5931\u8D25', icon: 'none' })
        },
      })
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          // no fallback — letter-list is the entry page
        },
      })
    },
  },
})
