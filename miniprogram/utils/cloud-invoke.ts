function rawErrMsg(err: unknown): string {
  if (err && typeof err === 'object' && 'errMsg' in err) {
    const message = (err as { errMsg?: unknown }).errMsg
    if (typeof message === 'string') return message
  }
  return String(err)
}

export function getCloudInvokeErrorMessage(err: unknown, cloudFunctionName: string): string {
  const raw = rawErrMsg(err)
  if (
    raw.indexOf('FUNCTION_NOT_FOUND') >= 0 ||
    raw.indexOf('-501000') >= 0 ||
    raw.indexOf('FunctionName parameter could not be found') >= 0
  ) {
    return '请部署云函数「' + cloudFunctionName + '」'
  }
  if (raw.indexOf('fail') >= 0) {
    return raw.length > 36 ? raw.slice(0, 34) + '…' : raw
  }
  return '网络或云开发异常'
}

export function showCloudInvokeErrorToast(err: unknown, cloudFunctionName: string): void {
  wx.showToast({
    title: getCloudInvokeErrorMessage(err, cloudFunctionName),
    icon: 'none',
    duration: 3200,
  })
}

export function formatBizError(message: string | undefined): string {
  if (!message) return '操作失败'
  return message.length > 36 ? message.slice(0, 34) + '…' : message
}
