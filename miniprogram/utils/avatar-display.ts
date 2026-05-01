/**
 * 头像展示 URL：云存储 fileID 在 <image> 上直连往往偏慢，本会话内 download 到临时路径后复用，减轻反复闪默认图。
 * 用户资料里的 fileID 仍由 moSession 保存；此处只做展示侧解析。
 */

const fileIdToTempPath = new Map<string, string>()

/** 临时文件是否仍存在（被系统清理则重新拉取） */
function tempPathStillValid(path: string): boolean {
  try {
    wx.getFileSystemManager().accessSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * @param avatarUrl 会话中的 avatarUrl（cloud / https / 本地临时路径等）
 * @returns 可直接赋给 <image src> 的地址；失败时回退为原始值或默认图
 */
export async function resolveAvatarDisplayUrl(
  avatarUrl: string | undefined | null,
): Promise<string> {
  const raw = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''
  if (!raw || raw === '/images/default.png') {
    return '/images/default.png'
  }
  if (!raw.startsWith('cloud://')) {
    return raw
  }
  if (!wx.cloud) {
    return raw
  }

  const cached = fileIdToTempPath.get(raw)
  if (cached && tempPathStillValid(cached)) {
    return cached
  }
  if (cached) {
    fileIdToTempPath.delete(raw)
  }

  try {
    const res = await wx.cloud.downloadFile({ fileID: raw })
    const p = res.tempFilePath
    if (p) {
      fileIdToTempPath.set(raw, p)
      return p
    }
  } catch {
    // 回落为 cloud://，由原生组件再试
  }
  return raw
}
