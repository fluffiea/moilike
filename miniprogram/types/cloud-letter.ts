/** 云函数名，与 cloudfunctions/letters 目录一致 */
export const LETTERS_CLOUD_FUNCTION = 'letters' as const

/** 信件公开数据（toPublicLetter 产出） */
export type LetterPublic = {
  id: string
  title: string
  content: string
  type: string
  images: string[]
  senderId: string
  receiverId: string
  time: string
  createdAtMs: number
  isMine: boolean
}

/** 云函数 letters · action list */
export type LettersListCloudResult =
  | { ok: true; list: LetterPublic[]; hasMore: boolean; nextOffset: number }
  | { ok: false; error?: string }

/** 云函数 letters · action summary */
export type LetterSummaryCloudResult =
  | { ok: true; total: number; recent: LetterPublic[] }
  | { ok: false; error?: string }

/** 云函数 letters · action get */
export type LetterGetCloudResult =
  | { ok: true; letter: LetterPublic }
  | { ok: false; error?: string }

/** 云函数 letters · action create */
export type LetterCreateCloudResult =
  | { ok: true; letter: LetterPublic }
  | { ok: false; error?: string }

/** 云函数 letters · action delete */
export type LetterDeleteCloudResult =
  | { ok: true }
  | { ok: false; error?: string }

/** 云函数 letters · action getMediaTempURLs */
export type LetterMediaTempUrlsCloudResult =
  | { ok: true; urls: Record<string, string> }
  | { ok: false; error?: string }
