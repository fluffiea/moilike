import type { DailyPostPublic } from '../../types/cloud'
import { mapAvatarCloudFileIdsToHttps } from './avatar-display'
import { dailyMapMediaTempUrls } from '../api/daily-api'

/** 日期分组 */
export type DailyGroup = {
  dateLabel: string
  dateKey: string
  posts: DailyPostPublic[]
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function dateKeyFromMs(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateLabelFromMs(ms: number, now: Date): string {
  const d = new Date(ms)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.floor((today.getTime() - target.getTime()) / 86400000)

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'

  const dayOfWeek = target.getDay()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  if (target >= weekStart) {
    return WEEKDAY_LABELS[dayOfWeek]
  }

  return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAY_LABELS[dayOfWeek]}`
}

/**
 * 将已按时间倒序的帖子列表按日期分组。
 * 无 createdAtMs 的帖子归入 "更早" 组（排在最后）。
 */
export function groupDailyPostsByDate(posts: DailyPostPublic[]): DailyGroup[] {
  if (posts.length === 0) return []
  const now = new Date()
  const groups: DailyGroup[] = []
  for (let i = 0; i < posts.length; i++) {
    const p = posts[i]
    const ms = typeof p.createdAtMs === 'number' && p.createdAtMs > 0 ? p.createdAtMs : 0
    const key = ms > 0 ? dateKeyFromMs(ms) : '__unknown__'
    const label = ms > 0 ? dateLabelFromMs(ms, now) : '更早'
    const last = groups[groups.length - 1]
    if (last && last.dateKey === key) {
      last.posts.push(p)
    } else {
      groups.push({ dateLabel: label, dateKey: key, posts: [p] })
    }
  }
  return groups
}

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
 * 浮生页日常流：头像、配图中的 cloud:// 在 Skyline 下需换临时 HTTPS，且对方文件客户端无读权限。
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
