import type { TempFileUrlsCloudResult } from '../types/cloud'
import { USER_CLOUD_FUNCTION } from '../types/cloud'
import type { MoPartner } from '../types/user'

/** 与页面默认头像路径一致 */
export const DEFAULT_AVATAR_PATH = '/images/default.png'

const AVATAR_CLOUD_PREFIX = '/avatars/'
const TEMP_URL_BATCH_SIZE = 20

function isAvatarCloudFileId(s: string): boolean {
  return s.startsWith('cloud://') && s.includes(AVATAR_CLOUD_PREFIX)
}

/**
 * Skyline 下 `<image src>` 不可直接使用 `cloud://`（DevTools 会拼成 `.../pages/xxx/cloud://...` 去请求，返回 500）。
 * 在 `resolveAvatarForDisplay` 换到临时 HTTPS 之前，用默认图占位。
 */
export function avatarImageSrcWhileCloudPending(ref: string | undefined | null): string {
  const s = typeof ref === 'string' ? ref.trim() : ''
  if (!s || s === DEFAULT_AVATAR_PATH) return DEFAULT_AVATAR_PATH
  if (isAvatarCloudFileId(s)) return DEFAULT_AVATAR_PATH
  return s
}

/**
 * 经云函数 user.getTempFileURLs 换临时 HTTPS（服务端权限，避免读对方 avatars 时 STORAGE_EXCEED_AUTHORITY）。
 * 仅提交路径含 `/avatars/` 的 fileID，与登录/资料页上传路径一致。
 */
async function fetchAvatarTempUrlsViaUserFn(fileList: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [
    ...new Set(fileList.filter((x): x is string => typeof x === 'string' && isAvatarCloudFileId(x))),
  ]
  if (unique.length === 0 || !wx.cloud) return out
  try {
    const res = await wx.cloud.callFunction({
      name: USER_CLOUD_FUNCTION,
      data: { action: 'getTempFileURLs', fileIDs: unique.slice(0, TEMP_URL_BATCH_SIZE) },
    })
    const body = res.result as TempFileUrlsCloudResult
    if (!body || body.ok !== true || !body.urls) return out
    for (const [fid, url] of Object.entries(body.urls)) {
      if (typeof url === 'string' && url) out.set(fid, url)
    }
  } catch {
    // ignore
  }
  return out
}

/**
 * 将头像引用转为 `<image>` 可用的 src：cloud:// 经云函数换临时 HTTPS（客户端 getTempFileURL 对非本人文件会权限失败）。
 */
export async function resolveAvatarForDisplay(ref: string | undefined | null): Promise<string> {
  const s = typeof ref === 'string' ? ref.trim() : ''
  if (!s || s === DEFAULT_AVATAR_PATH) return DEFAULT_AVATAR_PATH
  if (s.startsWith('cloud://')) {
    if (!wx.cloud) return DEFAULT_AVATAR_PATH
    if (!isAvatarCloudFileId(s)) return DEFAULT_AVATAR_PATH
    const m = await fetchAvatarTempUrlsViaUserFn([s])
    return m.get(s) || DEFAULT_AVATAR_PATH
  }
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('wxfile://')) return s
  return DEFAULT_AVATAR_PATH
}

async function collectAvatarTempUrlMap(fileIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const unique = [...new Set(fileIds)]
  for (let i = 0; i < unique.length; i += TEMP_URL_BATCH_SIZE) {
    const part = await fetchAvatarTempUrlsViaUserFn(unique.slice(i, i + TEMP_URL_BATCH_SIZE))
    for (const [k, v] of part) {
      out.set(k, v)
    }
  }
  return out
}

/**
 * 批量解析 cloud://（每批最多 TEMP_URL_BATCH_SIZE 条，与云函数上限一致）。
 */
export async function resolveAvatarForDisplayList(refs: (string | undefined)[]): Promise<string[]> {
  const normalized = refs.map((r) => (typeof r === 'string' ? r.trim() : ''))
  const cloudIds = [...new Set(normalized.filter((x) => isAvatarCloudFileId(x)))]
  const map = await collectAvatarTempUrlMap(cloudIds)
  return normalized.map((s) => {
    if (!s || s === DEFAULT_AVATAR_PATH) return DEFAULT_AVATAR_PATH
    if (s.startsWith('cloud://')) return map.get(s) || DEFAULT_AVATAR_PATH
    if (/^https?:\/\//i.test(s)) return s
    if (s.startsWith('wxfile://')) return s
    return DEFAULT_AVATAR_PATH
  })
}

/** 批量将 `avatars/` 下 cloud fileID 换为临时 HTTPS（日常流卡片头像等）。 */
export async function mapAvatarCloudFileIdsToHttps(
  fileIDs: (string | undefined | null)[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(
      fileIDs
        .map((x) => (typeof x === 'string' ? x.trim() : ''))
        .filter((s) => isAvatarCloudFileId(s)),
    ),
  ]
  return collectAvatarTempUrlMap(unique)
}

/** 伴侣头像：在 `resolveAvatarForDisplay` 完成前用占位规则，避免 Skyline 直接请求 cloud:// */
export function moPartnerWithPendingAvatarSrc(p: MoPartner): MoPartner {
  return { ...p, avatarUrl: avatarImageSrcWhileCloudPending(p.avatarUrl) }
}
