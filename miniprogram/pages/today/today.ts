import requireAuth from '../../behaviors/require-auth'
import { PAGE_COMPOSE, PAGE_DETAIL, PAGE_LOGIN, PAGE_PAIR } from '../../constants/paths'
import type { MealPublic } from '../../types/meal'
import { SLOT_LABEL, SLOT_ORDER } from '../../types/meal'
import { listDay } from '../../utils/api/meal-api'
import { refreshSession } from '../../utils/api/user-api'
import { redirectIfNotAuthed } from '../../utils/auth-guard'
import { readChrome, syncTab } from '../../utils/chrome'
import { formatBizError, showCloudInvokeErrorToast } from '../../utils/cloud-invoke'
import { formatDateLabel, formatDayKey, formatHm, shiftDayKey } from '../../utils/meal-rules'
import { userIsPaired } from '../../utils/session'

const HISTORY_DAYS = 14
const INITIAL_DAY = formatDayKey(new Date())

type MealBlock = {
  id: string
  thumbs: string[]
  thumb: number
  caption: string
  capStyle: string
}

type SlotView = {
  slot: string
  label: string
  mine: MealBlock[]
  partner: MealBlock[]
  mineEmpty: boolean
  partnerEmpty: boolean
  emptyText: string
  showDot: boolean
}

let touchX = 0
let touchY = 0
let todayReq = 0

function thumbSize(count: number): number {
  if (count <= 1) return 156
  if (count === 2) return 136
  return 104
}

function captionOf(meal: MealPublic): string {
  const text = meal.text ? meal.text.trim() : ''
  if (text) return text.length > 8 ? text.slice(0, 8) + '…' : text
  return formatHm(meal.recordAtMs)
}

function blocks(list: MealPublic[]): MealBlock[] {
  const out: MealBlock[] = []
  for (let i = 0; i < list.length; i++) {
    const meal = list[i]
    const urls = meal.imageUrls.filter((item) => !!item)
    const thumbs = urls.length > 0 ? urls : ['']
    const size = thumbSize(thumbs[0] ? thumbs.length : 1)
    out.push({
      id: meal.id,
      thumbs: thumbs,
      thumb: size,
      caption: captionOf(meal),
      capStyle: thumbs.length <= 1 ? 'width:' + size + 'rpx' : '',
    })
  }
  return out
}

function buildSlots(meals: MealPublic[], paired: boolean): SlotView[] {
  const out: SlotView[] = []
  for (let i = 0; i < SLOT_ORDER.length; i++) {
    const slot = SLOT_ORDER[i]
    const mine: MealPublic[] = []
    const partner: MealPublic[] = []
    for (let j = 0; j < meals.length; j++) {
      const meal = meals[j]
      if (meal.slot !== slot) continue
      if (meal.isMine) mine.push(meal)
      else partner.push(meal)
    }
    let unread = false
    for (let j = 0; j < partner.length; j++) {
      if (!partner[j].partnerReadAtMs) unread = true
    }
    out.push({
      slot: slot,
      label: SLOT_LABEL[slot],
      mine: blocks(mine),
      partner: blocks(partner),
      mineEmpty: mine.length === 0,
      partnerEmpty: partner.length === 0,
      emptyText: paired ? '未报' : '未结伴',
      showDot: paired && (partner.length === 0 || unread),
    })
  }
  return out
}

function dayBounds(dayKey: string): { canPrev: boolean; canNext: boolean } {
  const today = formatDayKey(new Date())
  const oldest = shiftDayKey(today, -HISTORY_DAYS)
  return { canPrev: dayKey > oldest, canNext: dayKey < today }
}

Component({
  behaviors: [requireAuth],
  data: {
    statusBarHeight: 20,
    dayKey: INITIAL_DAY,
    dateLabel: formatDateLabel(INITIAL_DAY),
    canPrev: true,
    canNext: false,
    loaded: false,
    paired: false,
    slots: [] as SlotView[],
    entryTitle: '餐食报备',
    entrySub: '记录今日餐食，同步给对方',
    entryBtn: '去报备',
  },
  methods: {
    onLoad() {
      const chrome = readChrome()
      const dayKey = formatDayKey(new Date())
      const bounds = dayBounds(dayKey)
      this.setData({
        statusBarHeight: chrome.statusBarHeight,
        dayKey: dayKey,
        dateLabel: formatDateLabel(dayKey),
        canPrev: bounds.canPrev,
        canNext: bounds.canNext,
      })
    },

    onShow() {
      if (redirectIfNotAuthed()) return
      syncTab(this, 0)
      void this.refresh()
    },

    applyPair(paired: boolean) {
      this.setData({
        paired: paired,
        entryTitle: paired ? '餐食报备' : '先和伴侣结伴',
        entrySub: paired ? '记录今日餐食，同步给对方' : '结伴之后才能互相报备餐食',
        entryBtn: paired ? '去报备' : '去结伴',
      })
    },

    async refresh() {
      try {
        const user = await refreshSession()
        if (!user) {
          wx.reLaunch({ url: PAGE_LOGIN })
          return
        }
        this.applyPair(userIsPaired(user))
      } catch (err) {
        showCloudInvokeErrorToast(err, 'user')
      }
      await this.load()
    },

    async load() {
      const dayKey = this.data.dayKey
      if (!dayKey) return
      const token = ++todayReq
      try {
        const res = await listDay(dayKey)
        if (token !== todayReq) return
        if (!res.ok) {
          this.setData({ loaded: true })
          wx.showToast({ title: formatBizError(res.error), icon: 'none' })
          return
        }
        this.applyPair(res.paired)
        this.setData({ loaded: true, slots: buildSlots(res.meals, res.paired) })
      } catch (err) {
        if (token !== todayReq) return
        this.setData({ loaded: true })
        showCloudInvokeErrorToast(err, 'meal')
      }
    },

    shift(delta: number) {
      const boundsNow = dayBounds(this.data.dayKey)
      if (delta < 0 && !boundsNow.canPrev) return
      if (delta > 0 && !boundsNow.canNext) return
      const dayKey = shiftDayKey(this.data.dayKey, delta)
      const bounds = dayBounds(dayKey)
      this.setData({
        dayKey: dayKey,
        dateLabel: formatDateLabel(dayKey),
        canPrev: bounds.canPrev,
        canNext: bounds.canNext,
        loaded: false,
      })
      void this.load()
    },

    onPrev() {
      this.shift(-1)
    },

    onNext() {
      this.shift(1)
    },

    onTouchStart(e: WechatMiniprogram.TouchEvent) {
      const touch = e.touches && e.touches[0]
      if (!touch) return
      touchX = touch.clientX
      touchY = touch.clientY
    },

    onTouchEnd(e: WechatMiniprogram.TouchEvent) {
      const touch = e.changedTouches && e.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - touchX
      const dy = touch.clientY - touchY
      if (Math.abs(dx) < 56) return
      if (Math.abs(dx) < Math.abs(dy)) return
      this.shift(dx > 0 ? -1 : 1)
    },

    onOpen(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id
      if (typeof id !== 'string' || !id) return
      wx.navigateTo({ url: PAGE_DETAIL + '?id=' + encodeURIComponent(id) })
    },

    onEntry() {
      if (!this.data.paired) {
        wx.navigateTo({ url: PAGE_PAIR })
        return
      }
      wx.navigateTo({ url: PAGE_COMPOSE + '?dayKey=' + this.data.dayKey })
    },
  },
})
