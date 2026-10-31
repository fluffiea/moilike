/** 交互反馈：统一 toast / 确认 / 操作菜单 / 震动 */

export function toast(title: string): void {
  wx.showToast({ title, icon: 'none', duration: 2000 })
}

export function toastDone(title: string): void {
  wx.showToast({ title, icon: 'success', duration: 1200 })
  wx.vibrateShort({ type: 'light', fail: () => {} })
}

export function confirm(opts: { title: string; content: string; confirmText: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: opts.title,
      content: opts.content,
      confirmText: opts.confirmText,
      cancelText: '取消',
      confirmColor: opts.danger ? '#c25b5b' : '#4a6670',
      success: (r) => resolve(r.confirm),
      fail: () => resolve(false),
    })
  })
}

/** 返回所选下标，取消为 -1 */
export function actionSheet(items: string[]): Promise<number> {
  return new Promise((resolve) => {
    wx.showActionSheet({
      itemList: items,
      success: (r) => resolve(r.tapIndex),
      fail: () => resolve(-1),
    })
  })
}

/** 「编辑 / 删除」菜单，返回 'edit' | 'delete' | null */
export async function editOrDelete(): Promise<'edit' | 'delete' | null> {
  const i = await actionSheet(['编辑', '删除'])
  return i === 0 ? 'edit' : i === 1 ? 'delete' : null
}
