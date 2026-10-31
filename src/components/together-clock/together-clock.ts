import { durationSince } from '../../core/format'

/** 「在一起」计时：每秒只更新本组件的 4 个数字，页面隐藏时停表 */
Component<
  { days: string; hours: string; minutes: string; seconds: string },
  { since: { type: NumberConstructor; value: number } },
  WechatMiniprogram.Component.MethodOption,
  { timer: number }
>({
  options: { styleIsolation: 'isolated' },
  properties: {
    since: { type: Number, value: 0 },
  },
  data: { days: '0', hours: '00', minutes: '00', seconds: '00' },
  observers: {
    since() {
      this.tick()
    },
  },
  lifetimes: {
    attached() {
      this.start()
    },
    detached() {
      this.stop()
    },
  },
  pageLifetimes: {
    show() {
      this.start()
    },
    hide() {
      this.stop()
    },
  },
  methods: {
    tick() {
      if (this.data.since > 0) this.setData(durationSince(this.data.since))
    },
    start() {
      this.stop()
      this.tick()
      this.timer = setInterval(() => this.tick(), 1000)
    },
    stop() {
      if (this.timer) clearInterval(this.timer)
      this.timer = 0
    },
  },
})
