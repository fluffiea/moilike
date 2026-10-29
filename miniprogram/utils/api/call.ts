export async function callFn<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const res = await wx.cloud.callFunction({ name: name, data: data })
  return res.result as T
}
