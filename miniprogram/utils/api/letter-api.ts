import {
  LETTERS_CLOUD_FUNCTION,
  type LetterSummaryCloudResult,
  type LettersListCloudResult,
  type LetterCreateCloudResult,
  type LetterGetCloudResult,
  type LetterDeleteCloudResult,
  type LetterMediaTempUrlsCloudResult,
} from '../../types/cloud'

/** letters 云函数客户端封装 */

export async function lettersGetSummary(): Promise<LetterSummaryCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: LETTERS_CLOUD_FUNCTION,
      data: { action: 'summary' },
    })
    return res.result as LetterSummaryCloudResult
  } catch {
    return null
  }
}

export async function lettersList(offset: number): Promise<LettersListCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: LETTERS_CLOUD_FUNCTION,
      data: { action: 'list', offset },
    })
    return res.result as LettersListCloudResult
  } catch {
    return null
  }
}

export async function lettersGet(id: string): Promise<LetterGetCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: LETTERS_CLOUD_FUNCTION,
      data: { action: 'get', id },
    })
    return res.result as LetterGetCloudResult
  } catch {
    return null
  }
}

export async function lettersCreate(
  title: string,
  content: string,
  receiverId: string,
  type?: string,
  images?: string[],
): Promise<LetterCreateCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: LETTERS_CLOUD_FUNCTION,
      data: { action: 'create', title, content, receiverId, type, images },
    })
    return res.result as LetterCreateCloudResult
  } catch {
    return null
  }
}

export async function lettersDelete(id: string): Promise<LetterDeleteCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: LETTERS_CLOUD_FUNCTION,
      data: { action: 'delete', id },
    })
    return res.result as LetterDeleteCloudResult
  } catch {
    return null
  }
}

export async function lettersGetMediaTempURLs(
  fileIDs: string[],
  letterId?: string,
): Promise<LetterMediaTempUrlsCloudResult | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({
      name: LETTERS_CLOUD_FUNCTION,
      data: { action: 'getMediaTempURLs', fileIDs, letterId },
    })
    return res.result as LetterMediaTempUrlsCloudResult
  } catch {
    return null
  }
}
