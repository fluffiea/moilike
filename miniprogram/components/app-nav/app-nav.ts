/**
 * 顶栏安全区（px）：自定义导航下部分机型 env(safe-area) 不可靠，用系统信息兜底。
 * getSystemInfoSync 会链路到 getWindowInfo；多实例各调一次易与 AgentPage 等并发报错，
 * 故模块内只读一次并缓存（见开发者工具 getWindowInfo / temporarilyAllow 相关讨论）。
 */
const NAV_SAFE_TOP_MIN_PX = 20
const NAV_SAFE_TOP_FALLBACK_PX = 24

let navSafePaddingTopPxMemo: number | null = null

function getNavSafePaddingTopPx(): number {
  if (navSafePaddingTopPxMemo !== null) {
    return navSafePaddingTopPxMemo
  }
  try {
    const win = wx.getSystemInfoSync()
    const safeArea = win.safeArea
    const safeTop = safeArea && typeof safeArea.top === 'number' ? safeArea.top : 0
    const status = typeof win.statusBarHeight === 'number' ? win.statusBarHeight : 0
    const paddingTop = Math.max(safeTop, status, NAV_SAFE_TOP_MIN_PX)
    navSafePaddingTopPxMemo = paddingTop
    return paddingTop
  } catch {
    navSafePaddingTopPxMemo = NAV_SAFE_TOP_FALLBACK_PX
    return NAV_SAFE_TOP_FALLBACK_PX
  }
}

Component({
  options: {
    styleIsolation: 'isolated',
  },
  data: {
    safePaddingTop: NAV_SAFE_TOP_FALLBACK_PX,
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
