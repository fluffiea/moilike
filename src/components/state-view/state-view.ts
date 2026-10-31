/**
 * 列表 / 页面的加载、空、错误状态，以及列表底部的「加载更多」状态。
 * 点击按钮触发 action 事件（重试、去结伴、去发布等由页面决定）。
 */
Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    /** loading | empty | error | more-loading | more-error | end */
    status: { type: String, value: 'loading' },
    title: { type: String, value: '' },
    hint: { type: String, value: '' },
    action: { type: String, value: '' },
    /** 骨架卡片数量 */
    rows: { type: Number, value: 3 },
  },
  data: { skeleton: [0, 1, 2] },
  observers: {
    rows(n: number) {
      this.setData({ skeleton: Array.from({ length: n }, (_v, i) => i) })
    },
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    },
  },
})
