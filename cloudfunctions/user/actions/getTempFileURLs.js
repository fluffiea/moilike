/**
 * action: getTempFileURLs - 换取头像临时链接
 * @param {{ event: Record<string, unknown>, cloud: any, helpers: any }} ctx
 */
async function getTempFileURLs(ctx) {
  const { event, cloud, helpers } = ctx
  const { cappedUniqueAvatarFileIds } = helpers

  const capped = cappedUniqueAvatarFileIds(event.fileIDs)
  if (capped.length === 0) return { ok: true, urls: {} }
  try {
    const r = await cloud.getTempFileURL({ fileList: capped })
    const urls = {}
    for (const it of r.fileList || []) {
      if (it.fileID && it.status === 0 && typeof it.tempFileURL === 'string' && it.tempFileURL) {
        urls[it.fileID] = it.tempFileURL
      }
    }
    return { ok: true, urls }
  } catch (e) {
    console.error('getTempFileURLs', e)
    return { ok: false, error: '换取展示链接失败' }
  }
}

module.exports = getTempFileURLs
