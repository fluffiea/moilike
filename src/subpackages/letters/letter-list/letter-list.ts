import requireAuth from '../../../behaviors/require-auth'
import { lettersList } from '../../../utils/api/letter-api'
import { formatCloudBizError } from '../../../utils/cloud-invoke'
import { PAGE_LETTER_COMPOSE, PAGE_LETTER_DETAIL } from '../../../constants/paths'

/** 预置信件类型映射（纯文字，不用 emoji：部分机型缺 emoji 字体会显示成方框） */
const TYPE_LABELS: Record<string, string> = {
  confession: '\u8868\u767D',
  apology: '\u9053\u6B49',
  thankyou: '\u611F\u8C22',
  wish: '\u8BB8\u613F',
  whisper: '\u6084\u6084\u8BDD',
}

type LetterDisplayItem = {
  id: string
  title: string
  preview: string
  typeLabel: string
  thumbImages: string[]
  dayLabel: string
  createdAtMs: number
  isMine: boolean
}

/** 信箱按月分组 */
type LetterSection = {
  key: string
  label: string
  items: LetterDisplayItem[]
}

type LetterListData = {
  loading: boolean
  list: LetterDisplayItem[]
  sections: LetterSection[]
  loadingMore: boolean
  hasMore: boolean
  offset: number
}

type LetterListMethods = WechatMiniprogram.Component.MethodOption

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

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

/** 组内只需「日 + 时分」，年份月份已由组头承担 */
function makeDayLabel(ms: number, fallback: string): string {
  if (!ms || Number.isNaN(ms)) return fallback
  const d = new Date(ms)
  return d.getDate() + '\u65E5 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

function groupByMonth(items: LetterDisplayItem[]): LetterSection[] {
  const out: LetterSection[] = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const d = it.createdAtMs ? new Date(it.createdAtMs) : null
    const key = d ? d.getFullYear() + '-' + pad2(d.getMonth() + 1) : 'earlier'
    const label = d ? d.getFullYear() + '\u5E74' + (d.getMonth() + 1) + '\u6708' : '\u66F4\u65E9'
    const last = out[out.length - 1]
    if (last && last.key === key) {
      last.items.push(it)
    } else {
      out.push({ key, label, items: [it] })
    }
  }
  return out
}

Component<LetterListData, {}, LetterListMethods, {}>({
  behaviors: [requireAuth],
  data: {
    loading: true,
    list: [],
    sections: [],
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
          // 传输层失败已由 callCloud 弹出可定位原因的 toast，这里只收尾状态
          if (replace) this.setData({ list: [] })
          this.setData({ hasMore: false, loading: false, loadingMore: false })
          return
        }
        if (!r.ok || !Array.isArray(r.list)) {
          if (replace) this.setData({ list: [] })
          this.setData({ hasMore: false })
          wx.showToast({ title: r && r.ok === false ? formatCloudBizError(r.error) : '加载失败', icon: 'none' })
          return
        }

        const items: LetterDisplayItem[] = r.list.map((doc) => {
          const ms = typeof doc.createdAtMs === 'number' ? doc.createdAtMs : 0
          return {
            id: doc.id,
            title: doc.title || '',
            preview: makePreview(doc.content),
            typeLabel: makeTypeLabel(doc.type),
            thumbImages: makeThumbImages(doc.images),
            dayLabel: makeDayLabel(ms, doc.time),
            createdAtMs: ms,
            isMine: doc.isMine === true,
          }
        })

        const nextList = replace ? items : [...this.data.list, ...items]
        this.setData({
          list: nextList,
          sections: groupByMonth(nextList),
          offset: r.nextOffset,
          hasMore: r.hasMore,
        })
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
