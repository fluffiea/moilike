/**
 * 云存储 fileID → 可直接渲染的 HTTPS 链接。
 * 存储保持私有，由服务端在同一次请求里批量签名，前端不再单独换链。
 */

const SIGN_BATCH = 50
const MAX_AGE_SECONDS = 2 * 60 * 60

/** 缩略图走云存储图片处理；环境未开通时设云函数环境变量 THUMBNAIL=off 关闭 */
const THUMB_ENABLED = process.env.THUMBNAIL !== 'off'

/** @param {string} url @param {number} px */
function thumb(url, px) {
  if (!url || !THUMB_ENABLED) return url
  return url + (url.includes('?') ? '&' : '?') + `imageMogr2/thumbnail/${px}x${px}`
}

/**
 * @param {any} cloud
 * @param {unknown[]} fileIds
 * @returns {Promise<Map<string, string>>}
 */
async function sign(cloud, fileIds) {
  const unique = [...new Set(fileIds.filter((f) => typeof f === 'string' && f.startsWith('cloud://')))]
  const out = new Map()
  if (unique.length === 0) return out
  const batches = []
  for (let i = 0; i < unique.length; i += SIGN_BATCH) batches.push(unique.slice(i, i + SIGN_BATCH))
  const results = await Promise.all(
    batches.map((batch) =>
      cloud
        .getTempFileURL({ fileList: batch.map((fileID) => ({ fileID, maxAge: MAX_AGE_SECONDS })) })
        .catch((e) => {
          console.error('getTempFileURL', e)
          return { fileList: [] }
        }),
    ),
  )
  for (const r of results) {
    for (const it of r.fileList || []) {
      if (it.status === 0 && it.tempFileURL) out.set(it.fileID, it.tempFileURL)
    }
  }
  return out
}

/**
 * @param {string[]} fileIds
 * @param {Map<string, string>} urls
 * @returns {{ id: string, thumb: string, url: string }[]}
 */
function images(fileIds, urls) {
  return fileIds.map((fid) => {
    const url = urls.get(fid) || ''
    return { id: fid, thumb: thumb(url, 600), url }
  })
}

/** @param {unknown} fileId @param {Map<string, string>} urls */
function avatar(fileId, urls) {
  if (typeof fileId !== 'string') return ''
  if (/^https:\/\//.test(fileId)) return fileId
  return thumb(urls.get(fileId) || '', 200)
}

module.exports = { sign, images, avatar }
