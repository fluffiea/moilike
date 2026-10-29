export const STICKERS = ['好吃！', '想尝一口', '记得按时吃饭', '辛苦啦', '看着眼馋', '抱抱'] as const

export type StickerText = (typeof STICKERS)[number]
