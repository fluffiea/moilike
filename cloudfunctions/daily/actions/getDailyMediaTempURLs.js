/**
 * action: getDailyMediaTempURLs - 换取日常配图临时链接
 * @param {{ event: Record<string, unknown>, cloud: any, usersCol: any, helpers: any }} ctx
 */
async function getDailyMediaTempURLs(ctx) {
  const { event, cloud, usersCol, helpers } = ctx
  const { getMutualPartnerOpenId, coupleAuthorOpenIds, recordTempFileUrlsFromSdk } = require('../common/utils')
  const { isDailyImageFileIdVisibleToCouple } = helpers

  const raw = event.fileIDs
  const list = Array.isArray(raw) ? [...new Set(raw)] : []
  const partner = await getMutualPartnerOpenId(usersCol, ctx.OPENID)
  const coupleSet = new Set(coupleAuthorOpenIds(ctx.OPENID, partner))
  const capped = list
    .filter((x) => typeof x === 'string' && x.startsWith('cloud://'))
    .filter((fid) => isDailyImageFileIdVisibleToCouple(fid, coupleSet))
    .slice(0, 20)
  if (capped.length === 0) {
    return { ok: true, urls: {} }
  }
  try {
    const r = await cloud.getTempFileURL({ fileList: capped })
    return { ok: true, urls: recordTempFileUrlsFromSdk(r.fileList) }
  } catch (e) {
    console.error('getDailyMediaTempURLs', e)
    return { ok: false, error: '换取展示链接失败' }
  }
}

module.exports = getDailyMediaTempURLs
