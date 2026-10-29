export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

export type MealResponse = {
  sticker: string
  note: string
  updatedAtMs: number
}

export type MealPublic = {
  id: string
  authorOpenId: string
  authorNickName: string
  authorAvatarUrl: string
  authorAvatarDisplay: string
  isMine: boolean
  text: string
  images: string[]
  imageUrls: string[]
  slot: MealSlot
  dayKey: string
  recordAtMs: number
  partnerReadAtMs: number
  response: MealResponse | null
}

export const SLOT_ORDER: MealSlot[] = ['breakfast', 'lunch', 'dinner']

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
}
