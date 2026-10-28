import {
  LETTERS_CLOUD_FUNCTION,
  type LetterSummaryCloudResult,
  type LettersListCloudResult,
  type LetterCreateCloudResult,
  type LetterGetCloudResult,
  type LetterDeleteCloudResult,
  type LetterMediaTempUrlsCloudResult,
} from '../../types/cloud'
import { callCloud } from './cloud-call'

/**
 * letters 云函数客户端封装。
 * 失败时静默返回 null（页面自行展示空态/「无法加载」），因此统一传 silent。
 */

export async function lettersGetSummary(): Promise<LetterSummaryCloudResult | null> {
  return callCloud<LetterSummaryCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'summary' }, true)
}

export async function lettersList(offset: number): Promise<LettersListCloudResult | null> {
  return callCloud<LettersListCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'list', offset }, true)
}

export async function lettersGet(id: string): Promise<LetterGetCloudResult | null> {
  return callCloud<LetterGetCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'get', id }, true)
}

export async function lettersCreate(
  title: string,
  content: string,
  receiverId: string,
  type?: string,
  images?: string[],
): Promise<LetterCreateCloudResult | null> {
  return callCloud<LetterCreateCloudResult>(
    LETTERS_CLOUD_FUNCTION,
    { action: 'create', title, content, receiverId, type, images },
    true,
  )
}

export async function lettersDelete(id: string): Promise<LetterDeleteCloudResult | null> {
  return callCloud<LetterDeleteCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'delete', id }, true)
}

export async function lettersGetMediaTempURLs(
  fileIDs: string[],
  letterId?: string,
): Promise<LetterMediaTempUrlsCloudResult | null> {
  return callCloud<LetterMediaTempUrlsCloudResult>(
    LETTERS_CLOUD_FUNCTION,
    { action: 'getMediaTempURLs', fileIDs, letterId },
    true,
  )
}
