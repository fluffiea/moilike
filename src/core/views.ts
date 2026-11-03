/** 接口数据 → 模板展示数据。中文与数字拼好整句，WXML 只绑定单个变量（Skyline 混排兼容） */
import type { LetterItem, ReportPost } from '../types/api'
import { dateTime, dayLabel, dayStart, letterTypeLabel, listClock, monthLabel, pad2, relativeTime, reportStatus } from './format'
import { stickerById } from './stickers'

/** 与上一条不在同一天时返回日期标签，否则为空串 */
function daySeparator(ms: number, prevMs: number | undefined): string {
  return prevMs !== undefined && dayStart(prevMs) === dayStart(ms) ? '' : dayLabel(ms)
}

/** 有换行时首行当标题，其余当补充；没有换行就整段当标题 */
function splitBody(body: string): { headline: string; rest: string } {
  const text = body.replace(/\r\n/g, '\n').trim()
  const i = text.indexOf('\n')
  if (i < 0) return { headline: text, rest: '' }
  const headline = text.slice(0, i).trim()
  const rest = text.slice(i + 1).trim()
  if (!headline) return { headline: rest, rest: '' }
  return { headline, rest }
}

export function reportView(post: ReportPost, prev?: ReportPost, inDetail = false) {
  const status = reportStatus(post)
  const parts = splitBody(post.body)
  const sticker = stickerById(post.partnerStickerId)
  return {
    ...post,
    day: inDetail ? '' : daySeparator(post.recordAtMs, prev && prev.recordAtMs),
    headline: parts.headline || (post.tags.length ? post.tags.join(' · ') : '一条报备'),
    rest: parts.headline ? parts.rest : '',
    time: inDetail ? dateTime(post.recordAtMs) : listClock(post.recordAtMs),
    stateKey: status.key,
    stateLabel: status.label,
    sticker: sticker ? { id: sticker.id, label: sticker.label, src: sticker.src } : null,
    respondedWhen: post.partnerRespondedAt ? relativeTime(post.partnerRespondedAt) : '',
    openedHint: post.isMine && post.state !== 'responded' && post.partnerOpenedAt > 0 ? '对方已打开 · 暂未回心' : '',
  }
}
export type ReportView = ReturnType<typeof reportView>

export function letterView(item: LetterItem, prev?: LetterItem, partnerName = 'Ta') {
  const d = new Date(item.createdAtMs)
  const month = monthLabel(item.createdAtMs)
  const when = item.createdAtMs ? `${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : ''
  return {
    ...item,
    month: prev && monthLabel(prev.createdAtMs) === month ? '' : month,
    typeLabel: letterTypeLabel(item.type),
    who: item.isMine ? '我' : 'Ta',
    salutation: item.isMine ? `致 ${partnerName}` : `来自 ${partnerName}`,
    meta: when ? `${letterTypeLabel(item.type)} · ${when}` : letterTypeLabel(item.type),
  }
}
export type LetterView = ReturnType<typeof letterView>
