/** 接口数据 → 模板展示数据。中文与数字拼好整句，WXML 只绑定单个变量（Skyline 混排兼容） */
import type { LetterItem, ReportFilter, ReportPost, ReportState } from '../types/api'
import { dateTime, dayLabel, dayStart, letterTypeLabel, listClock, monthLabel, pad2, relativeTime, reportStatus } from './format'
import { stickerById } from './stickers'

export type ReportViewMode = ReportFilter | 'detail'

/** 未回心整段靠前。必须高于任何 recordAtMs，相加后仍落在安全整数里。 */
const MINE_UNREAD_AHEAD = 1e15

/**
 * 列表排序权重，越大越靠前。
 * 全部、待我回应只按记录时间，不把待回应顶上去。
 * 我发的把未回心整段放在已回心前面，段内仍按记录时间倒序。
 */
export function reportRank(post: { state: ReportState; recordAtMs: number }, mode: ReportViewMode): number {
  if (mode === 'mine' && post.state !== 'responded') return MINE_UNREAD_AHEAD + post.recordAtMs
  return post.recordAtMs
}

/** 「我发的」已加载条目的展示序。不改接口分页，只重排手里的这一截。 */
export function orderMineUnreadFirst<T extends { state: ReportState; recordAtMs: number }>(items: T[]): T[] {
  return items.slice().sort((a, b) => reportRank(b, 'mine') - reportRank(a, 'mine'))
}

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

export function reportView(post: ReportPost, prev?: ReportPost, mode: ReportViewMode = 'all') {
  const inDetail = mode === 'detail'
  // 已回心段的第一条要单独起一个日期，避免和上一段挤在同一个「今天」下面
  const sectionBreak = mode === 'mine' && post.state === 'responded' && prev !== undefined && prev.state !== 'responded'
  const dayPrev = sectionBreak ? undefined : prev
  const status = reportStatus(post)
  const parts = splitBody(post.body)
  const sticker = stickerById(post.partnerStickerId)
  return {
    ...post,
    day: inDetail ? '' : daySeparator(post.recordAtMs, dayPrev && dayPrev.recordAtMs),
    headline: parts.headline || (post.tags.length ? post.tags.join(' · ') : '一条报备'),
    rest: parts.headline ? parts.rest : '',
    time: inDetail ? dateTime(post.recordAtMs) : listClock(post.recordAtMs),
    stateKey: status.key,
    stateLabel: status.label,
    sticker: sticker ? { id: sticker.id, label: sticker.label, src: sticker.src } : null,
    respondedWhen: post.partnerRespondedAt ? relativeTime(post.partnerRespondedAt) : '',
    openedHint: post.isMine && post.state !== 'responded' && post.partnerOpenedAt > 0 ? '对方已打开 · 暂未回心' : '',
    /** 我发的：已回心段开头的弱分隔，不是第三顶栏 */
    repliedDivider: sectionBreak,
    /** 全部栏里已闭环降对比；待回应保持正常字重 */
    dimmed: mode === 'all' && post.state === 'responded',
    /** 只有待我回应、且还没贴的行能快捷贴 */
    quickReply: mode === 'await_me' && !post.isMine && post.state !== 'responded',
    /** 我发的上段可弱示已打开；不进全部 / 待我的主行 */
    listOpened: mode === 'mine' && post.state !== 'responded' && post.partnerOpenedAt > 0 ? '对方已打开' : '',
    /** 我发的下段在芯片旁展示回心相对时间 */
    showRespondedWhen: mode === 'mine' && post.state === 'responded',
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
