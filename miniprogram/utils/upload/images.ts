import moSession from '../session'

/**
 * 把本地临时路径上传为云存储 fileID；已是 cloud:// 的条目原样保留。
 *
 * @param prefix 云存储目录前缀，cloudPath 形如 `${prefix}/{openId}/{时间戳}_{序号}_{随机}.jpg`，
 *               必须与对应云函数换取临时链接时的路径校验一致（daily / reports / letters）。
 */
export async function uploadImagesToCloud(
  prefix: string,
  localOrCloud: string[],
): Promise<string[]> {
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
    if (p.indexOf('http://') === 0 || p.indexOf('https://') === 0) {
      throw new Error('配图含临时链接，请返回后重新进入编辑页再保存')
    }
    if (p.indexOf('cloud://') === 0) {
      out.push(p)
      continue
    }
    const cloudPath = `${prefix}/${openId}/${Date.now()}_${i}_${Math.random().toString(36).slice(2, 9)}.jpg`
    const r = await wx.cloud.uploadFile({ cloudPath, filePath: p })
    if (r && typeof r.fileID === 'string' && r.fileID) {
      out.push(r.fileID)
    } else {
      throw new Error('图片上传失败')
    }
  }
  return out
}
