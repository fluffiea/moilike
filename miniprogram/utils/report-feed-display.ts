import type { ReportPostPublic } from '../types/cloud'
import { reportTagColorIndex } from './report-tag-color'
import { reportMapMediaTempUrls } from './report-api'

function mapPostImagesWithTempUrls(
  images: string[] | undefined,
  imageMap: Map<string, string>,
): string[] {
  return (Array.isArray(images) ? images : []).map((img) => {
    if (typeof img !== 'string' || img.indexOf('cloud://') !== 0) return img
    const u = imageMap.get(img)
    return u != null && u.length > 0 ? u : img
  })
}

function buildTagChips(tags: string[] | undefined): { name: string; colorIdx: number }[] {
  const arr = Array.isArray(tags) ? tags : []
  const out: { name: string; colorIdx: number }[] = []
  for (let i = 0; i < arr.length; i++) {
    const name = typeof arr[i] === 'string' ? arr[i].trim() : ''
    if (!name) continue
    out.push({ name, colorIdx: reportTagColorIndex(name) })
  }
  return out
}

/** 单条列表卡 / 详情：与 {@link enrichReportPostsForDisplay} 同逻辑 */
export async function enrichReportPostForDisplay(post: ReportPostPublic): Promise<ReportPostPublic> {
  const arr = await enrichReportPostsForDisplay([post])
  return arr[0] != null ? arr[0] : post
}

/** 见证页报备流：配图 cloud:// 换临时 HTTPS；写入 tagChips */
export async function enrichReportPostsForDisplay(posts: ReportPostPublic[]): Promise<ReportPostPublic[]> {
  if (posts.length === 0) return posts
  const allImageIds = posts.flatMap((p) => (Array.isArray(p.images) ? p.images : []))
  const imageMap = await reportMapMediaTempUrls(allImageIds)
  return posts.map((p) => ({
    ...p,
    images: mapPostImagesWithTempUrls(p.images, imageMap),
    tagChips: buildTagChips(p.tags),
  }))
}
