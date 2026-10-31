/** 接口数据 → 模板展示数据。中文与数字拼好整句，WXML 只绑定单个变量（Skyline 混排兼容） */
import type { DailyPost, LetterItem, ReportPost } from '../types/api'
import { clock, dateTime, dayLabel, dayStart, letterTypeLabel, monthLabel, pad2, reportStateLabel, tagColor } from './format'

/** 与上一条不在同一天时返回日期标签，否则为空串 */
function daySeparator(ms: number, prevMs: number | undefined): string {
  return prevMs !== undefined && dayStart(prevMs) === dayStart(ms) ? '' : dayLabel(ms)
}

const initialOf = (name: string): string => (name ? name.slice(0, 1) : '·')

export function dailyView(post: DailyPost, prev?: DailyPost, inDetail = false) {
  const fc = post.firstComment
  return {
    ...post,
    day: inDetail ? '' : daySeparator(post.createdAtMs, prev && prev.createdAtMs),
    time: inDetail ? dateTime(post.createdAtMs) : clock(post.createdAtMs),
    initial: initialOf(post.author.name),
    previewLine: fc ? `${fc.name}：${fc.text}` : '',
    countLabel: post.commentCount > 1 ? `共 ${post.commentCount} 条评论` : '',
  }
}
export type DailyView = ReturnType<typeof dailyView>

export function reportView(post: ReportPost, prev?: ReportPost, inDetail = false) {
  return {
    ...post,
    day: inDetail ? '' : daySeparator(post.recordAtMs, prev && prev.recordAtMs),
    title: post.isMine ? '我的报备' : `${post.author.name} 的报备`,
    time: `记录于 ${inDetail ? dateTime(post.recordAtMs) : clock(post.recordAtMs)}`,
    stateLabel: reportStateLabel(post.state),
    tagChips: post.tags.map((name) => ({ name, color: tagColor(name) })),
    evalLabel: post.isMine ? 'Ta 的评价' : '我的评价',
  }
}
export type ReportView = ReturnType<typeof reportView>

export function letterView(item: LetterItem, prev?: LetterItem) {
  const d = new Date(item.createdAtMs)
  const month = monthLabel(item.createdAtMs)
  return {
    ...item,
    month: prev && monthLabel(prev.createdAtMs) === month ? '' : month,
    typeLabel: letterTypeLabel(item.type),
    role: item.isMine ? '寄出' : '收到',
    when: item.createdAtMs ? `${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '',
    titleText: item.title || '无题',
  }
}
export type LetterView = ReturnType<typeof letterView>
