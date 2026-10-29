import requireAuth from '../../../behaviors/require-auth'
import { TAB_TODAY } from '../../../constants/paths'
import { STICKERS } from '../../../constants/stickers'
import type { MealPublic, MealSlot } from '../../../types/meal'
import { SLOT_LABEL } from '../../../types/meal'
import { getMeal, respondMeal } from '../../../utils/api/meal-api'
import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import { readChrome } from '../../../utils/chrome'
import { formatBizError, showCloudInvokeErrorToast } from '../../../utils/cloud-invoke'
import { formatHm, pad2 } from '../../../utils/meal-rules'

type StickerChip = { text: string; on: boolean }

function stickerRows(picked: string): StickerChip[] {
  const rows: StickerChip[] = []
  for (let i = 0; i < STICKERS.length; i++) {
    rows.push({ text: STICKERS[i], on: STICKERS[i] === picked })
  }
  return rows
}

function relative(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  const date = new Date(ms)
  const hm = pad2(date.getHours()) + ':' + pad2(date.getMinutes())
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  if (sameDay) return hm
  return date.getMonth() + 1 + '月' + date.getDate() + '日 ' + hm
}

function readLineOf(meal: MealPublic): string {
  if (!meal.partnerReadAtMs) return meal.isMine ? '未读' : ''
  return '已读 · ' + relative(meal.partnerReadAtMs)
}

Component({
  behaviors: [requireAuth],
  data: {
    statusBarHeight: 20,
    safeBottom: 0,
    replyBottom: 12,
    id: '',
    ready: false,
    missing: false,
    authorName: '',
    avatar: '/images/default.png',
    slotLabel: '',
    timeLabel: '',
    text: '',
    photos: [] as string[],
    readLine: '',
    stickers: [] as StickerChip[],
    picked: '',
    note: '',
    canReply: false,
    partnerNote: '',
    quiet: false,
    sending: false,
  },
  methods: {
    onLoad(query: Record<string, string | undefined>) {
      if (redirectIfNotAuthed()) return
      const chrome = readChrome()
      const id = query && typeof query.id === 'string' ? query.id : ''
      this.setData({
        statusBarHeight: chrome.statusBarHeight,
        safeBottom: chrome.safeBottom,
        replyBottom: chrome.safeBottom + 12,
        id: id,
        stickers: stickerRows(''),
      })
      void this.load()
    },

    onBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_TODAY })
        },
      })
    },

    async load() {
      if (!this.data.id) {
        this.setData({ missing: true, ready: true })
        return
      }
      try {
        const res = await getMeal(this.data.id)
        if (!res.ok) {
          this.setData({ missing: true, ready: true })
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        this.paint(res.meal)
      } catch (err) {
        this.setData({ ready: true })
        showCloudInvokeErrorToast(err, 'meal')
      }
    },

    paint(meal: MealPublic) {
      const picked = meal.response && meal.response.sticker ? meal.response.sticker : ''
      const note = meal.response && meal.response.note ? meal.response.note : ''
      const photos: string[] = []
      for (let i = 0; i < meal.imageUrls.length; i++) {
        if (meal.imageUrls[i]) photos.push(meal.imageUrls[i])
      }
      const slot = meal.slot as MealSlot
      this.setData({
        ready: true,
        missing: false,
        authorName: meal.authorNickName || '未命名',
        avatar: meal.authorAvatarDisplay || '/images/default.png',
        slotLabel: SLOT_LABEL[slot] || '',
        timeLabel: formatHm(meal.recordAtMs),
        text: meal.text,
        photos: photos,
        readLine: readLineOf(meal),
        stickers: stickerRows(picked),
        picked: picked,
        note: meal.isMine ? '' : note,
        canReply: !meal.isMine,
        partnerNote: meal.isMine && note ? '对方说：' + note : '',
        quiet: meal.isMine && !picked && !note,
      })
    },

    onPick(e: WechatMiniprogram.TouchEvent) {
      if (!this.data.canReply) return
      const text = e.currentTarget.dataset.text
      if (typeof text !== 'string') return
      this.setData({ picked: text, stickers: stickerRows(text) })
    },

    onNote(e: WechatMiniprogram.Input) {
      this.setData({ note: e.detail.value })
    },

    onPreview(e: WechatMiniprogram.TouchEvent) {
      const current = e.currentTarget.dataset.src
      if (typeof current !== 'string' || !current) return
      wx.previewImage({ current: current, urls: this.data.photos })
    },

    async onSend() {
      if (!this.data.canReply || this.data.sending) return
      if (!this.data.picked) {
        wx.showToast({ title: '请选择心意', icon: 'none' })
        return
      }
      this.setData({ sending: true })
      try {
        const res = await respondMeal(this.data.id, this.data.picked, this.data.note.trim())
        this.setData({ sending: false })
        if (!res.ok) {
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        this.paint(res.meal)
        wx.showToast({ title: '已发送', icon: 'none' })
      } catch (err) {
        this.setData({ sending: false })
        showCloudInvokeErrorToast(err, 'meal')
      }
    },
  },
})
