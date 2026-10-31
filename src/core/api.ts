/**
 * 唯一的云函数调用入口。永不抛异常：网络 / 部署问题也转成 { ok: false }。
 */
import type { Result, Route, Routes } from '../types/api'
import { PAGE_LOGIN } from './paths'
import { logout } from './store'

const FUNCTION_NAME = 'api'

function transportMessage(err: unknown): string {
  const raw = err && typeof err === 'object' && 'errMsg' in err ? String((err as { errMsg: unknown }).errMsg) : String(err)
  if (raw.includes('FUNCTION_NOT_FOUND') || raw.includes('-501000')) {
    return '云函数 api 未部署：开发者工具中右键 cloudfunctions/api →「上传并部署：云端安装依赖」'
  }
  if (raw.includes('timeout') || raw.includes('超时')) return '网络有点慢，请稍后重试'
  return '网络不太稳定，请稍后重试'
}

export async function call<R extends Route>(route: R, data: Routes[R][0]): Promise<Result<Routes[R][1]>> {
  if (!wx.cloud) return { ok: false, code: 'NO_CLOUD', message: '当前微信版本不支持云开发' }
  let result: Result<Routes[R][1]>
  try {
    const res = await wx.cloud.callFunction({ name: FUNCTION_NAME, data: { route, ...data } })
    result = res.result as Result<Routes[R][1]>
  } catch (e) {
    console.error('[api]', route, e)
    return { ok: false, code: 'NETWORK', message: transportMessage(e) }
  }
  if (!result || typeof result !== 'object') {
    return { ok: false, code: 'BAD_RESPONSE', message: '服务返回异常，请稍后重试' }
  }
  if (!result.ok && result.code === 'NOT_REGISTERED') {
    logout()
    wx.reLaunch({ url: PAGE_LOGIN })
  }
  return result
}

/** 失败时的轻提示；成功时原样返回数据，失败返回 null */
export async function callOrToast<R extends Route>(route: R, data: Routes[R][0]): Promise<Routes[R][1] | null> {
  const r = await call(route, data)
  if (r.ok) return r.data
  wx.showToast({ title: r.message, icon: 'none', duration: 2500 })
  return null
}
