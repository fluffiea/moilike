/** 接口数据 → 模板展示数据。中文与数字拼好整句，WXML 只绑定单个变量（Skyline 混排兼容） */
import type { LetterItem, ReportPost } from '../types/api'
import { clock, dateTime, dayClock, dayLabel, dayStart, letterTypeLabel, monthLabel, pad2, relativeTime } from './format'
import { stickerById } from './stickers'

/**
 * 共鸣列表：全部 / 等我回声；已共鸣是只读档案，按年月分组；详情单独一档，时间写法不同。
 */
export type ReportViewMode = 'all' | 'await_me' | 'archive' | 'detail'

/** 与上一条不在同一天时返回日期标签，否则为空串 */
function daySeparator(ms: number, prevMs: number | undefined): string {
  return prevMs !== undefined && dayStart(prevMs) === dayStart(ms) ? '' : dayLabel(ms)
}

/** 与上一条不在同一个月时返回年月标签，否则为空串 */
function monthSeparator(ms: number, prevMs: number | undefined): string {
  const month = monthLabel(ms)
  return prevMs !== undefined && monthLabel(prevMs) === month ? '' : month
}

/** 列表里把正文压成一段，详情保留原始换行 */
function listText(body: string): string {
  return body.replace(/\s+/g, ' ').trim()
}

/**
 * 报备 → 卡片。每条都带一个「回声」槽：
 * 对方发的还没回心时是「等你的回声」+ 回心；我发的还没回心时是「等 Ta 的回声」；
 * 已回心时是贴纸 + 谁回的心 + 相对时间。列表和详情共用，详情不给快捷回心。
 * 已共鸣档案里不写相对时间，只写谁回的心，靠卡片上的日期回看。
 */
export function reportView(post: ReportPost, prev?: ReportPost, mode: ReportViewMode = 'all') {
  const inDetail = mode === 'detail'
  const inArchive = mode === 'archive'
  const sticker = stickerById(post.partnerStickerId)
  const shots = post.images || []
  const when = post.partnerRespondedAt ? relativeTime(post.partnerRespondedAt) : ''
  const responded = post.state === 'responded'
  /** 「Ta」是拉丁字母，后面留空格；「我」后面不留 */
  const echoBy = post.isMine ? 'Ta 回心' : '我回心'
  const echo = responded
    ? {
        sticker: sticker ? { id: sticker.id, label: sticker.label, src: sticker.src } : null,
        label: sticker ? sticker.label : '已回心',
        wait: '',
        when,
        meta: inArchive ? echoBy : when ? `${echoBy} · ${when}` : echoBy,
        action: false,
      }
    : {
        sticker: null,
        label: '',
        wait: post.isMine ? '等 Ta 的回声' : '等你的回声',
        when: '',
        meta: post.isMine && post.partnerOpenedAt > 0 ? 'Ta 已打开' : '',
        action: !inDetail && !inArchive && !post.isMine,
      }
  return {
    ...post,
    day: inDetail || inArchive ? '' : daySeparator(post.recordAtMs, prev && prev.recordAtMs),
    /** 已共鸣按年月分组，其余列表按日分组 */
    month: inArchive ? monthSeparator(post.recordAtMs, prev && prev.recordAtMs) : '',
    who: post.isMine ? '我' : 'Ta',
    /** 列表只给钟点；已共鸣在月份下给「4日 21:04」；详情给完整日期 */
    clock: inArchive ? dayClock(post.recordAtMs) : inDetail ? dateTime(post.recordAtMs) : clock(post.recordAtMs),
    preview: inDetail ? post.body : listText(post.body),
    tagLine: post.tags.length ? post.tags.join(' · ') : '',
    cover: shots[0] ? shots[0].thumb : '',
    moreShots: shots.length > 1 ? `还有 ${shots.length - 1} 张` : '',
    echo,
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
