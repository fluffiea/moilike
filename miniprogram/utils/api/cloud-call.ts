import { showCloudInvokeErrorToast } from '../cloud-invoke'
import { MEDIA_TEMP_URL_BATCH } from '../../constants/limits'
import type { TempFileUrlsCloudResult } from '../../types/cloud'

/**
 * 云函数调用的公共外壳：wx.cloud 可用性守卫 + 异常 toast + null 返回。
 * 调用方只需判断结果是否为 null / ok === false。
 *
 * @param silent 为 true 时不弹 toast（信件的静默失败语义），仅返回 null。
 */
export async function callCloud<T>(
  name: string,
  data: Record<string, unknown>,
  silent?: boolean,
): Promise<T | null> {
  if (!wx.cloud) return null
  try {
    const res = await wx.cloud.callFunction({ name, data })
    return res.result as T
  } catch (e) {
    // 无论是否静默都留日志：静默只影响 toast，不影响排查
    console.error('[callCloud] ' + name + ' / ' + String(data.action) + ' 失败', e)
    if (!silent) showCloudInvokeErrorToast(e, 4200, name)
    return null
  }
}

/** 并发请求去重：相同 key 的调用共享同一个 inflight Promise。 */
const inflight = new Map<string, Promise<unknown>>()

export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const p = fn().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, p)
  return p
}

/** 配图临时链接的复用窗口：8 分钟内同一 fileID 不再请求。 */
const MEDIA_TEMP_URL_TTL_MS = 8 * 60 * 1000

export type MediaTempUrlResolver = {
  map(fileIDs: string[]): Promise<Map<string, string>>
  invalidate(): void
}

/**
 * 创建一个「cloud:// fileID → 临时 HTTPS」映射器。
 * 云函数按批次返回，单批失败静默跳过（避免 toast 刷屏），结果按 fileID 缓存。
 */
export function createMediaTempUrlResolver(config: {
  cloudFunctionName: string
  action: string
}): MediaTempUrlResolver {
  const cache = new Map<string, { url: string; resolvedAt: number }>()

  return {
    invalidate(): void {
      cache.clear()
    },

    async map(fileIDs: string[]): Promise<Map<string, string>> {
      const out = new Map<string, string>()
      const unique = [
        ...new Set(fileIDs.filter((x) => typeof x === 'string' && x.indexOf('cloud://') === 0)),
      ]
      if (unique.length === 0 || !wx.cloud) return out

      const now = Date.now()
      const uncached: string[] = []
      for (const fid of unique) {
        const entry = cache.get(fid)
        if (entry && now - entry.resolvedAt < MEDIA_TEMP_URL_TTL_MS) {
          out.set(fid, entry.url)
        } else {
          uncached.push(fid)
        }
      }

      for (let i = 0; i < uncached.length; i += MEDIA_TEMP_URL_BATCH) {
        const chunk = uncached.slice(i, i + MEDIA_TEMP_URL_BATCH)
        try {
          const res = await wx.cloud.callFunction({
            name: config.cloudFunctionName,
            data: { action: config.action, fileIDs: chunk },
          })
          const body = res.result as TempFileUrlsCloudResult
          if (!body || body.ok !== true || !body.urls) continue
          for (const [fid, url] of Object.entries(body.urls)) {
            if (typeof url === 'string' && url) {
              out.set(fid, url)
              cache.set(fid, { url, resolvedAt: now })
            }
          }
        } catch {
          // 单批失败时跳过，避免 toast 刷屏
        }
      }
      return out
    },
  }
}
