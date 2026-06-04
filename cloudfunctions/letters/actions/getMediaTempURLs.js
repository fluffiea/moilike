/**
 * action: getMediaTempURLs - 换取信件配图临时链接
 * 只允许信件参与者换取配图链接。
 * @param {{ event: Record<string, unknown>, cloud: any, lettersCol: any, helpers: any, OPENID: string }} ctx
 */
async function getMediaTempURLs(ctx) {
  const { event, cloud, lettersCol, helpers, OPENID } = ctx
  const { isLetterParticipant } = helpers
  const { recordTempFileUrlsFromSdk } = require('../common/utils')

  const raw = event.fileIDs
  const list = Array.isArray(raw) ? [...new Set(raw)] : []
  if (list.length === 0) {
    return { ok: true, urls: {} }
  }

  // 验证调取者是否为信件参与者
  const letterId = typeof event.letterId === 'string' ? event.letterId : ''
  if (letterId) {
    let doc
    try {
      const r = await lettersCol.doc(letterId).get()
      doc = r.data
    } catch {
      return { ok: false, error: '信件不存在' }
    }
    if (!doc || !isLetterParticipant(doc, OPENID)) {
      return { ok: false, error: '无权查看' }
    }
  }

  const capped = list
    .filter((x) => typeof x === 'string' && x.startsWith('cloud://'))
    .slice(0, 20)

  if (capped.length === 0) {
    return { ok: true, urls: {} }
  }

  try {
    const r = await cloud.getTempFileURL({ fileList: capped })
    return { ok: true, urls: recordTempFileUrlsFromSdk(r.fileList) }
  } catch (e) {
    console.error('getMediaTempURLs', e)
    return { ok: false, error: '换取展示链接失败' }
  }
}

module.exports = getMediaTempURLs
