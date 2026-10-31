/** 图片预览：统一的 dataset 取下标 + 越界收敛 + 空值守卫。 */

/** 从事件 dataset 读取图片下标；兼容 number / 数字字符串，非法值归 0。 */
export function imageIndexFromDataset(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return 0
  const n = Number(raw)
  if (Number.isNaN(n)) return 0
  const i = Math.floor(n)
  return i < 0 ? 0 : i
}

/** 预览图片：下标自动收敛到 urls 范围内；空列表或当前项不可用时不做任何事。 */
export function previewImagesAt(urls: string[] | undefined, index: number): void {
  if (!urls || urls.length === 0) return
  const max = urls.length - 1
  const idx = index < 0 ? 0 : index > max ? max : index
  const cur = urls[idx]
  if (typeof cur !== 'string' || cur.length === 0) return
  wx.previewImage({ current: cur, urls })
}
