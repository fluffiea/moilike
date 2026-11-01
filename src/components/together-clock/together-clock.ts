import { togetherReading } from '../../core/format'

/** 「在一起」计时：每秒只更新第 N 天和已过时长，页面隐藏时停表 */
Component<
  { ordinal: string; elapsed: string },
  { since: { type: NumberConstructor; value: number } },
  WechatMiniprogram.Component.MethodOption,
  { timer: number }
>({
  options: { styleIsolation: 'isolated' },
  properties: {
    since: { type: Number, value: 0 },
  },
  data: { ordinal: '1', elapsed: '00:00:00' },
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
      if (this.data.since > 0) this.setData(togetherReading(this.data.since))
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
