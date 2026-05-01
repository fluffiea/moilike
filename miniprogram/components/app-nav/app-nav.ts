/** 自定义导航栏顶部留白（px）：真机/Skyline 下仅用 env() 在部分机型为 0，导致内容上顶，故用窗口 API 兜底（避免 ?. 以兼容工具链） */
function getNavSafePaddingTopPx(): number {
  try {
    let win: WechatMiniprogram.WindowInfo | WechatMiniprogram.SystemInfo
    if (typeof wx.getWindowInfo === 'function') {
      win = wx.getWindowInfo()
    } else {
      win = wx.getSystemInfoSync()
    }
    const safeArea = win.safeArea
    const safeTop = safeArea && typeof safeArea.top === 'number' ? safeArea.top : 0
    const status = typeof win.statusBarHeight === 'number' ? win.statusBarHeight : 0
    return Math.max(safeTop, status, 20)
  } catch {
    return 24
  }
}

Component({
  options: {
    styleIsolation: 'isolated',
  },
  data: {
    safePaddingTop: 24,
  },
  lifetimes: {
    attached() {
      this.setData({ safePaddingTop: getNavSafePaddingTopPx() })
    },
  },
  properties: {
    title: {
      type: String,
      value: '',
    },
    bg: {
      type: String,
      value: '#ffffff',
    },
    /** solid：使用 bg 实色底；glass：L2 玻璃顶栏（moilike-ui 玻璃三件套） */
    variant: {
      type: String,
      value: 'solid',
    },
    /** 显示左侧返回；点击触发 `back` 事件（由页面内 wx.navigateBack） */
    showBack: {
      type: Boolean,
      value: false,
    },
  },
  methods: {
    onBackTap() {
      this.triggerEvent('back')
    },
  },
})
