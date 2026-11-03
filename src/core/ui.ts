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

/** 单行输入。取消返回 null，确定返回原文（可能是空串） */
export function promptText(opts: { title: string; placeholder?: string; value?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    wx.showModal({
      title: opts.title,
      editable: true,
      placeholderText: opts.placeholder || '',
      content: opts.value || '',
      confirmText: '确定',
      confirmColor: '#4a6670',
      success: (r) => resolve(r.confirm ? r.content : null),
      fail: () => resolve(null),
    })
  })
}

/** 「编辑 / 删除」菜单，返回 'edit' | 'delete' | null */
export async function editOrDelete(): Promise<'edit' | 'delete' | null> {
  const i = await actionSheet(['编辑', '删除'])
  return i === 0 ? 'edit' : i === 1 ? 'delete' : null
}
