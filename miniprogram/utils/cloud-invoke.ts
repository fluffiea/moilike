import { USER_CLOUD_FUNCTION } from '../types/cloud'

function rawErrMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) {
    const m = (err as { errMsg?: unknown }).errMsg
    if (typeof m === 'string') return m
  }
  return String(err)
}

/** 将 wx.cloud.callFunction 的失败转成可读说明（含未部署云函数） */
export function getCloudInvokeErrorMessage(err: unknown): string {
  const raw = rawErrMsg(err)
  if (
    raw.includes('FUNCTION_NOT_FOUND') ||
    raw.includes('-501000') ||
    raw.includes('FunctionName parameter could not be found')
  ) {
    return `请部署云函数「${USER_CLOUD_FUNCTION}」：开发者工具左侧 cloudfunctions/user 右键 → 上传并部署（含依赖），并与当前云环境一致`
  }
  if (raw.includes('fail')) {
    return raw.length > 60 ? `${raw.slice(0, 57)}…` : raw
  }
  return '网络或云开发异常，请稍后重试'
}

export function showCloudInvokeErrorToast(err: unknown, duration = 4200): void {
  wx.showToast({
    title: getCloudInvokeErrorMessage(err),
    icon: 'none',
    duration,
  })
}

/** 云函数已执行但返回 ok:false 时的 error 文案 */
export function formatUserCloudBizError(message: string | undefined): string {
  if (!message) return '操作失败'
  if (message.includes('users') && (message.includes('not exist') || message.includes('不存在'))) {
    return '请在云开发「数据库」中确认集合 users 已创建（首次同步用户资料会自动建文档）'
  }
  return message.length > 40 ? `${message.slice(0, 37)}…` : message
}
