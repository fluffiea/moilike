import type { BindRequest, User } from '../../../types/api'
import { call } from '../../../core/api'
import { dateStr, dateTime, fullDate, parseDateTime, timeStr } from '../../../core/format'
import { getUser, setUser } from '../../../core/store'
import { confirm, toast, toastDone } from '../../../core/ui'

type RequestView = BindRequest & { when: string }

type Data = {
  status: 'loading' | 'ready' | 'error'
  errorText: string
  refreshing: boolean
  partner: { avatarUrl: string; nickName: string; signature: string } | null
  sinceLabel: string
  date: string
  time: string
  today: string
  bindCode: string
  inbound: RequestView[]
  outbound: RequestView | null
  codeDraft: string
  busy: string
}

const withWhen = (r: BindRequest): RequestView => ({ ...r, when: dateTime(r.createdAtMs) })

Component<Data, {}, WechatMiniprogram.Component.MethodOption, {}, true>({
  data: {
    status: 'loading',
    errorText: '',
    refreshing: false,
    partner: null,
    sinceLabel: '',
    date: '',
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
      this.setData({
        status: 'ready',
        partner: u.partner ? { avatarUrl: u.partner.avatarUrl, nickName: u.partner.nickName, signature: u.partner.signature || 'Ta 还没有写签名' } : null,
        sinceLabel: u.togetherSinceMs ? `已设为 ${fullDate(u.togetherSinceMs)}，双方同步` : '还没有设置纪念日',
        date: dateStr(since),
        time: timeStr(since),
        today: dateStr(Date.now()),
      })
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
      this.setData({ date: String(e.detail.value) })
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
      const accept = e.currentTarget.dataset.accept === true
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
