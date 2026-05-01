import moSession from './session'

/**
 * 将本地临时路径上传为云存储 fileID；已是 cloud:// 的条目原样保留。
 */
export async function uploadDailyImagesIfNeeded(localOrCloud: string[]): Promise<string[]> {
  const u = moSession.loadMoUser()
  const openId = u && u.openId ? u.openId : ''
  if (!openId) {
    throw new Error('未登录')
  }
  if (!wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
    throw new Error('云开发不可用')
  }
  const out: string[] = []
  for (let i = 0; i < localOrCloud.length; i++) {
    const p = localOrCloud[i]
    if (typeof p !== 'string' || p.length === 0) continue
    if (p.indexOf('cloud://') === 0) {
      out.push(p)
      continue
    }
    const cloudPath = `daily/${openId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}.jpg`
    const r = await wx.cloud.uploadFile({
      cloudPath,
      filePath: p,
    })
    if (r.fileID) {
      out.push(r.fileID)
    }
  }
  return out
}
