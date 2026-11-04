/** 固定贴纸包。图在 src/images/stickers/，id 与云函数 STICKER_IDS 一致。 */

export const STICKERS = [
  { id: 'care', label: '收到啦', src: '/images/stickers/care.png' },
  { id: 'seen', label: '看见了', src: '/images/stickers/seen.png' },
  { id: 'eat', label: '记得吃饭', src: '/images/stickers/eat.png' },
  { id: 'miss', label: '想你', src: '/images/stickers/miss.png' },
  { id: 'ok', label: '好的', src: '/images/stickers/ok.png' },
  { id: 'hug', label: '抱抱', src: '/images/stickers/hug.png' },
  { id: 'proud', label: '辛苦了', src: '/images/stickers/proud.png' },
  { id: 'love', label: '爱你', src: '/images/stickers/love.png' },
] as const

export type StickerId = (typeof STICKERS)[number]['id']

export type StickerChoice = { id: string; label: string; src: string }

/** 列表快捷贴和详情共用的一句说明 */
export const RESPOND_TITLE = '回一颗心'
export const RESPOND_AGAIN_TITLE = '换一颗心'
export const RESPOND_HINT = '点一个贴纸，就是给 Ta 的回声。'

/** setData 需要普通数组，不能直接塞 readonly 元组 */
export function stickerChoices(): StickerChoice[] {
  return STICKERS.map((s) => ({ id: s.id, label: s.label, src: s.src }))
}

export function stickerById(id: string): (typeof STICKERS)[number] | null {
  return STICKERS.find((s) => s.id === id) || null
}
