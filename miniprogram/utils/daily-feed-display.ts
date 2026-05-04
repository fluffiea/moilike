import type { DailyPostPublic } from '../types/cloud'
import { mapAvatarCloudFileIdsToHttps } from './avatar-display'
import { dailyMapMediaTempUrls } from './daily-api'

/** 将帖内 cloud 配图替换为临时 HTTPS（换失败则保留原 fileID）。 */
function mapPostImagesWithTempUrls(
  images: string[] | undefined,
  imageMap: Map<string, string>,
): string[] {
  return (Array.isArray(images) ? images : []).map((img) => {
    if (typeof img !== 'string' || !img.startsWith('cloud://')) return img
    return imageMap.get(img) || img
  })
}

/**
 * 见证页日常流：头像、配图中的 cloud:// 在 Skyline 下需换临时 HTTPS，且对方文件客户端无读权限。
 */
export async function enrichDailyPostsForDisplay(posts: DailyPostPublic[]): Promise<DailyPostPublic[]> {
  if (posts.length === 0) return posts
  const avatarIds = posts.map((p) => p.avatarUrl)
  const allImageIds = posts.flatMap((p) => (Array.isArray(p.images) ? p.images : []))
  const [avatarMap, imageMap] = await Promise.all([
    mapAvatarCloudFileIdsToHttps(avatarIds),
    dailyMapMediaTempUrls(allImageIds),
  ])
  return posts.map((p) => {
    const rawAv = typeof p.avatarUrl === 'string' ? p.avatarUrl.trim() : ''
    let avatarUrl = p.avatarUrl
    if (rawAv.startsWith('cloud://')) {
      const u = avatarMap.get(rawAv)
      avatarUrl = u != null && u.length > 0 ? u : ''
    }
    const nRaw = p.commentCount
    const n =
      typeof nRaw === 'number' && !Number.isNaN(nRaw) && nRaw > 0 ? Math.floor(nRaw) : 0
    const commentCountLabel = n > 0 ? `共 ${n} 条评论` : ''
    return {
      ...p,
      avatarUrl,
      images: mapPostImagesWithTempUrls(p.images, imageMap),
      commentCountLabel,
    }
  })
}
