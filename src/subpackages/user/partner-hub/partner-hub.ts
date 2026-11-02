import type { BindRequest, User } from '../../../types/api'
import { call } from '../../../core/api'
import { dateStr, dateTime, fullDate, parseDateTime, timeStr } from '../../../core/format'
import { getUser, setUser } from '../../../core/store'
import { confirm, toast, toastDone } from '../../../core/ui'

type RequestView = BindRequest & { when: string; initial: string }

type Person = { avatarUrl: string; initial: string }

type PartnerView = Person & { nickName: string; signature: string; hasSignature: boolean }

type Data = {
  status: 'loading' | 'ready' | 'error'
  errorText: string
  refreshing: boolean
  me: Person
  partner: PartnerView | null
  sinceSet: boolean
  sinceHeadline: string
  date: string
  dateText: string
  time: string
  today: string
  bindCode: string
  inbound: RequestView[]
  outbound: RequestView | null
  codeDraft: string
  busy: string
}

function dayText(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  return `${y}年${m}月${d}日`
}

const withWhen = (r: BindRequest): RequestView => ({
  ...r,
  when: dateTime(r.createdAtMs),
  initial: r.name.slice(0, 1),
})

Component<Data, {}, WechatMiniprogram.Component.MethodOption, {}, true>({
  data: {
    status: 'loading',
    errorText: '',
    refreshing: false,
    me: { avatarUrl: '', initial: '' },
    partner: null,
    sinceSet: false,
    sinceHeadline: '',
    date: '',
    dateText: '',
    time: '',
    today: '',
    bindCode: '',
    inbound: [],
    outbound: null,
    codeDraft: '',
    busy: '',
  },
  methods: {
    onLoad() {
      const u = getUser()
      if (u && u.partner) this.renderUser(u)
      void this.load()
    },

    async load() {
      const r = await call('user.partnerPanel', {})
      this.setData({ refreshing: false })
      if (!r.ok) {
        if (this.data.status === 'ready') return toast(r.message)
        return this.setData({ status: 'error', errorText: r.message })
      }
      setUser(r.data.user)
      this.renderUser(r.data.user)
      this.setData({
        bindCode: r.data.bindCode,
        inbound: r.data.inbound.map(withWhen),
        outbound: r.data.outbound ? withWhen(r.data.outbound) : null,
      })
    },

    renderUser(u: User) {
      const since = u.togetherSinceMs || Date.now()
      const p = u.partner
      const date = dateStr(since)
      this.setData({
        status: 'ready',
        me: { avatarUrl: u.avatarUrl, initial: u.nickName.slice(0, 1) },
        partner: p
          ? {
              avatarUrl: p.avatarUrl,
              initial: p.nickName.slice(0, 1),
              nickName: p.nickName,
              signature: p.signature,
              hasSignature: Boolean(p.signature),
            }
          : null,
        sinceSet: Boolean(u.togetherSinceMs),
        sinceHeadline: u.togetherSinceMs ? fullDate(u.togetherSinceMs) : '',
        date,
        dateText: dayText(date),
        time: timeStr(since),
        today: dateStr(Date.now()),
      })
    },

    onAvatarError(e: WechatMiniprogram.TouchEvent) {
      const who = e.currentTarget.dataset.who as 'me' | 'partner' | 'outbound'
      if (who === 'me') this.setData({ 'me.avatarUrl': '' })
      else if (who === 'outbound') this.setData({ 'outbound.avatarUrl': '' })
      else this.setData({ 'partner.avatarUrl': '' })
    },

    onRequestAvatarError(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      this.setData({ [`inbound[${index}].avatarUrl`]: '' })
    },

    onRefresh() {
      this.setData({ refreshing: true })
      void this.load()
    },
    onRetry() {
      this.setData({ status: 'loading' })
      void this.load()
    },

    onDate(e: WechatMiniprogram.PickerChange) {
      const date = String(e.detail.value)
      this.setData({ date, dateText: dayText(date) })
    },
    onTime(e: WechatMiniprogram.PickerChange) {
      this.setData({ time: String(e.detail.value) })
    },

    async onSaveSince() {
      if (this.data.busy) return
      const ms = parseDateTime(this.data.date, this.data.time)
      if (!Number.isFinite(ms)) return toast('请选择日期与时间')
      this.setData({ busy: 'since' })
      const r = await call('user.setTogetherSince', { togetherSinceMs: ms })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      setUser(r.data.user)
      this.renderUser(r.data.user)
      toastDone('纪念日已同步')
    },

    onCopyCode() {
      if (!this.data.bindCode) return
      wx.setClipboardData({ data: this.data.bindCode, success: () => toastDone('已复制') })
    },
    onCodeInput(e: WechatMiniprogram.Input) {
      this.setData({ codeDraft: e.detail.value })
    },

    async onRequest() {
      const bindCode = this.data.codeDraft.trim()
      if (!bindCode) return toast('请先填写对方的绑定码')
      if (this.data.busy) return
      this.setData({ busy: 'request' })
      const r = await call('user.requestBind', { bindCode })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      this.setData({ codeDraft: '' })
      toastDone('申请已发出')
      void this.load()
    },

    async onRespond(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id)
      const raw = e.currentTarget.dataset.accept
      const accept = raw === true || raw === 'true'
      if (this.data.busy) return
      if (accept) {
        const ok = await confirm({
          title: '确认和 Ta 结伴？',
          content: '同意后你们会成为彼此唯一的结伴对象，其他待处理的申请会自动关闭。',
          confirmText: '同意结伴',
        })
        if (!ok) return
      }
      this.setData({ busy: id })
      const r = await call('user.respondBind', { requestId: id, accept })
      this.setData({ busy: '' })
      if (!r.ok) return toast(r.message)
      setUser(r.data.user)
      toastDone(accept ? '结伴成功' : '已拒绝')
      void this.load()
    },
  },
})
