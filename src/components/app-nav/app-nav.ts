/** 状态栏高度只读一次：自定义导航下 env(safe-area-inset-top) 在部分机型不可靠 */
let statusBarPx = 0

function getStatusBarPx(): number {
  if (!statusBarPx) {
    try {
      const win = wx.getWindowInfo()
      statusBarPx = Math.max(win.statusBarHeight || 0, win.safeArea ? win.safeArea.top : 0, 20)
    } catch {
      statusBarPx = 24
    }
  }
  return statusBarPx
}

Component({
  options: { styleIsolation: 'isolated' },
  properties: {
    title: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    /** 非空时返回前二次确认（有未保存内容）；系统返回手势由页面的 enableAlertBeforeUnload 兜住 */
    confirmLeave: { type: String, value: '' },
  },
  data: { top: 24 },
  lifetimes: {
    attached() {
      this.setData({ top: getStatusBarPx() })
    },
  },
  methods: {
    onBack() {
      const leave = () => {
        if (getCurrentPages().length > 1) wx.navigateBack()
        else wx.switchTab({ url: '/pages/milestones/milestones' })
      }
      if (!this.data.confirmLeave) return leave()
      wx.showModal({
        title: '确定离开？',
        content: this.data.confirmLeave,
        confirmText: '离开',
        confirmColor: '#c25b5b',
        success: (r) => r.confirm && leave(),
      })
    },
  },
})
