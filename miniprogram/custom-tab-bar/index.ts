Component({
  data: {
    selected: 0,
  },
  methods: {
    onSwitch(e: WechatMiniprogram.TouchEvent) {
      const raw = e.currentTarget.dataset.index
      const index = typeof raw === 'number' ? raw : parseInt(String(raw), 10)
      const url = index === 1 ? '/pages/mine/mine' : '/pages/today/today'
      wx.switchTab({ url: url })
    },
  },
})
