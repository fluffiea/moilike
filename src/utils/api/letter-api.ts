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
 *
 * 只有 summary 走静默（朝夕页入口卡是附属信息，失败不该打断主页面）；
 * 列表 / 详情 / 写信的失败一律弹出可定位原因（例如云函数未部署会直接提示部署）。
 */

export async function lettersGetSummary(): Promise<LetterSummaryCloudResult | null> {
  return callCloud<LetterSummaryCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'summary' }, true)
}

export async function lettersList(offset: number): Promise<LettersListCloudResult | null> {
  return callCloud<LettersListCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'list', offset })
}

export async function lettersGet(id: string): Promise<LetterGetCloudResult | null> {
  return callCloud<LetterGetCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'get', id })
}

export async function lettersCreate(
  title: string,
  content: string,
  receiverId: string,
  type?: string,
  images?: string[],
): Promise<LetterCreateCloudResult | null> {
  return callCloud<LetterCreateCloudResult>(LETTERS_CLOUD_FUNCTION, {
    action: 'create',
    title,
    content,
    receiverId,
    type,
    images,
  })
}

export async function lettersDelete(id: string): Promise<LetterDeleteCloudResult | null> {
  return callCloud<LetterDeleteCloudResult>(LETTERS_CLOUD_FUNCTION, { action: 'delete', id })
}

export async function lettersGetMediaTempURLs(
  fileIDs: string[],
  letterId?: string,
): Promise<LetterMediaTempUrlsCloudResult | null> {
  return callCloud<LetterMediaTempUrlsCloudResult>(LETTERS_CLOUD_FUNCTION, {
    action: 'getMediaTempURLs',
    fileIDs,
    letterId,
  })
}
