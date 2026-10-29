type ChromeInfo = {
  statusBarHeight?: number
  screenHeight?: number
  safeArea?: { bottom: number }
}

export function readChrome(): { statusBarHeight: number; safeBottom: number } {
  const info = (
    typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  ) as ChromeInfo
  const statusBarHeight = info.statusBarHeight || 20
  let safeBottom = 0
  if (info.safeArea && info.screenHeight) {
    safeBottom = info.screenHeight - info.safeArea.bottom
    if (safeBottom < 0) safeBottom = 0
  }
  return { statusBarHeight: statusBarHeight, safeBottom: safeBottom }
}

export function syncTab(page: WechatMiniprogram.Component.TrivialInstance, selected: number): void {
  const bar = page.getTabBar()
  if (bar) bar.setData({ selected: selected })
}
