/** 共鸣 Tab 在 tabBar 里的下标（朝夕 0、点单 1、共鸣 2、独白 3）。待接单数不打在点单上。 */
const RESONANCE_TAB = 2

/** 待我回应条数。0 时拿掉角标，避免留下一个「0」。 */
export function applyResonanceBadge(count: number): void {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  if (n > 0) {
    wx.setTabBarBadge({ index: RESONANCE_TAB, text: n > 99 ? '99+' : String(n), fail() {} })
  } else {
    wx.removeTabBarBadge({ index: RESONANCE_TAB, fail() {} })
  }
}
