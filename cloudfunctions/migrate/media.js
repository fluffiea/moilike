const https = require('https')
const http = require('http')

const MAX_BYTES = 8 * 1024 * 1024

function downloadBuffer(url, redirects) {
  const left = typeof redirects === 'number' ? redirects : 0
  if (left > 3) return Promise.reject(new Error('重定向过多'))
  return new Promise((resolve, reject) => {
    let lib = null
    if (url.indexOf('https://') === 0) lib = https
    else if (url.indexOf('http://') === 0) lib = http
    else {
      reject(new Error('仅支持 http(s) 临时链接'))
      return
    }
    const req = lib.get(url, (res) => {
      const code = res.statusCode || 0
      if (code >= 300 && code < 400 && res.headers && res.headers.location) {
        res.resume()
        downloadBuffer(res.headers.location, left + 1).then(resolve, reject)
        return
      }
      if (code !== 200) {
        res.resume()
        reject(new Error('下载失败 ' + code))
        return
      }
      const chunks = []
      let size = 0
      res.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BYTES) {
          req.destroy()
          reject(new Error('图片过大'))
          return
        }
        chunks.push(chunk)
      })
      res.on('end', () => resolve(Buffer.concat(chunks)))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(20000, () => {
      req.destroy()
      reject(new Error('下载超时'))
    })
  })
}

function fileInThisEnv(fileID, envId) {
  return !!(
    envId &&
    typeof fileID === 'string' &&
    fileID.indexOf('cloud://') === 0 &&
    fileID.indexOf(envId) >= 0
  )
}

function safeId(id) {
  return String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 48) || 'meal'
}

/**
 * 把旧图换成当前环境的 fileID。
 * 已在当前环境的 cloud:// 直接沿用；有 https 临时链接则下载再上传；否则记入 pending。
 */
async function rewriteSources(cloud, sources, authorOpenId, legacyId, envId) {
  const images = []
  const pending = []
  for (let i = 0; i < sources.length; i++) {
    const src = sources[i]
    if (fileInThisEnv(src.fileID, envId)) {
      images.push(src.fileID)
      continue
    }
    const temp = src.tempUrl
    const isHttp = typeof temp === 'string' && (temp.indexOf('https://') === 0 || temp.indexOf('http://') === 0)
    if (!isHttp) {
      pending.push(src.fileID)
      continue
    }
    try {
      const buf = await downloadBuffer(temp, 0)
      const uploaded = await cloud.uploadFile({
        cloudPath: 'meals/' + authorOpenId + '/legacy-' + safeId(legacyId) + '-' + i + '.jpg',
        fileContent: buf,
      })
      if (uploaded && uploaded.fileID) images.push(uploaded.fileID)
      else pending.push(src.fileID)
    } catch (err) {
      console.error('rewriteSources', legacyId, i, err)
      pending.push(src.fileID)
    }
  }
  return { images: images, pending: pending }
}

module.exports = {
  downloadBuffer,
  fileInThisEnv,
  rewriteSources,
}
