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

export function stickerById(id: string): (typeof STICKERS)[number] | null {
  return STICKERS.find((s) => s.id === id) || null
}
