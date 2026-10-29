import requireAuth from '../../../behaviors/require-auth'
import { PAGE_LOGIN, TAB_TODAY } from '../../../constants/paths'
import type { MealSlot } from '../../../types/meal'
import { createMeal } from '../../../utils/api/meal-api'
import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import { readChrome } from '../../../utils/chrome'
import { formatBizError, showCloudInvokeErrorToast } from '../../../utils/cloud-invoke'
import { formatDayKey, inferSlot, pad2, recordAtFrom } from '../../../utils/meal-rules'
import { loadMoUser } from '../../../utils/session'

type Cell = { kind: 'photo' | 'add'; src: string; index: number; end: boolean }
type Chip = { slot: MealSlot; label: string; on: boolean }

function layout(paths: string[]): Cell[] {
  const cells: Cell[] = []
  for (let i = 0; i < paths.length; i++) {
    cells.push({ kind: 'photo', src: paths[i], index: i, end: false })
  }
  if (paths.length < 9) cells.push({ kind: 'add', src: '', index: -1, end: false })
  for (let i = 0; i < cells.length; i++) cells[i].end = (i + 1) % 3 === 0
  return cells
}

function chips(slot: MealSlot): Chip[] {
  return [
    { slot: 'breakfast', label: '早餐', on: slot === 'breakfast' },
    { slot: 'lunch', label: '午餐', on: slot === 'lunch' },
    { slot: 'dinner', label: '晚餐', on: slot === 'dinner' },
  ]
}

Component({
  behaviors: [requireAuth],
  data: {
    statusBarHeight: 20,
    safeBottom: 0,
    dayKey: '',
    paths: [] as string[],
    cells: [] as Cell[],
    text: '',
    timeLabel: '12:00',
    slot: 'lunch' as MealSlot,
    slotLocked: false,
    slotChips: [] as Chip[],
    canPublish: false,
    publishing: false,
  },
  methods: {
    onLoad(query: Record<string, string | undefined>) {
      if (redirectIfNotAuthed()) return
      const chrome = readChrome()
      const today = formatDayKey(new Date())
      const incoming = query && typeof query.dayKey === 'string' ? query.dayKey : ''
      const dayKey = /^\d{4}-\d{2}-\d{2}$/.test(incoming) ? incoming : today
      const now = new Date()
      let hm = pad2(now.getHours()) + ':' + pad2(now.getMinutes())
      let slot: MealSlot = inferSlot(now.getHours(), now.getMinutes())
      if (dayKey !== today) {
        hm = '12:00'
        slot = 'lunch'
      }
      this.setData({
        statusBarHeight: chrome.statusBarHeight,
        safeBottom: chrome.safeBottom,
        dayKey: dayKey,
        timeLabel: hm,
        slot: slot,
        slotChips: chips(slot),
        cells: layout([]),
      })
    },

    onCancel() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_TODAY })
        },
      })
    },

    onAdd() {
      const remain = 9 - this.data.paths.length
      if (remain <= 0) {
        wx.showToast({ title: '最多九张照片', icon: 'none' })
        return
      }
      wx.chooseMedia({
        count: remain,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const files = res.tempFiles || []
          const next = this.data.paths.slice()
          for (let i = 0; i < files.length && next.length < 9; i++) {
            if (files[i].tempFilePath) next.push(files[i].tempFilePath)
          }
          this.setData({ paths: next, cells: layout(next), canPublish: next.length > 0 })
        },
      })
    },

    onRemove(e: WechatMiniprogram.TouchEvent) {
      const raw = e.currentTarget.dataset.index
      const index = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
      if (Number.isNaN(index) || index < 0) return
      const next: string[] = []
      for (let i = 0; i < this.data.paths.length; i++) {
        if (i !== index) next.push(this.data.paths[i])
      }
      this.setData({ paths: next, cells: layout(next), canPublish: next.length > 0 })
    },

    onText(e: { detail: { value: string } }) {
      this.setData({ text: e.detail.value })
    },

    onTime(e: { detail: { value: string } }) {
      const value = e.detail.value
      const slot = this.data.slotLocked ? this.data.slot : inferSlotFrom(value)
      this.setData({ timeLabel: value, slot: slot, slotChips: chips(slot) })
    },

    onSlot(e: WechatMiniprogram.TouchEvent) {
      const slot = e.currentTarget.dataset.slot
      if (slot !== 'breakfast' && slot !== 'lunch' && slot !== 'dinner') return
      this.setData({ slot: slot, slotLocked: true, slotChips: chips(slot) })
    },

    async onPublish() {
      if (this.data.publishing) return
      if (this.data.paths.length === 0) {
        wx.showToast({ title: '请先添加照片', icon: 'none' })
        return
      }
      const user = loadMoUser()
      if (!user) {
        wx.reLaunch({ url: PAGE_LOGIN })
        return
      }
      const recordAtMs = recordAtFrom(this.data.dayKey, this.data.timeLabel)
      if (!recordAtMs) {
        wx.showToast({ title: '时间不正确', icon: 'none' })
        return
      }
      this.setData({ publishing: true })
      wx.showLoading({ title: '上传中' })
      try {
        const images: string[] = []
        for (let i = 0; i < this.data.paths.length; i++) {
          const up = await wx.cloud.uploadFile({
            cloudPath:
              'meals/' +
              user.openId +
              '/' +
              Date.now() +
              '-' +
              i +
              '-' +
              Math.floor(Math.random() * 10000) +
              '.jpg',
            filePath: this.data.paths[i],
          })
          images.push(up.fileID)
        }
        const res = await createMeal({
          images: images,
          text: this.data.text.trim(),
          slot: this.data.slot,
          dayKey: this.data.dayKey,
          recordAtMs: recordAtMs,
        })
        wx.hideLoading()
        if (!res.ok) {
          this.setData({ publishing: false })
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        wx.navigateBack({
          fail: () => {
            wx.switchTab({ url: TAB_TODAY })
          },
        })
      } catch (err) {
        wx.hideLoading()
        this.setData({ publishing: false })
        showCloudInvokeErrorToast(err, 'meal')
      }
    },
  },
})

function inferSlotFrom(hm: string): MealSlot {
  const parts = hm.split(':')
  const hour = parseInt(parts[0], 10)
  const minute = parseInt(parts[1], 10)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 'lunch'
  return inferSlot(hour, minute)
}
