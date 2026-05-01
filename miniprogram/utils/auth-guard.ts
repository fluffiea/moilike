import { loadMoUser } from './session'
import { PAGE_LOGIN, ROUTE_LOGIN } from '../constants/paths'

/** @returns 若已执行重定向到登录页则返回 true */
export function redirectIfNotAuthed(): boolean {
  const pages = getCurrentPages()
  if (pages.length === 0) return false
  const top = pages[pages.length - 1] as { route?: string } | undefined
  const route = top && top.route ? top.route : ''
  if (route === ROUTE_LOGIN) return false
  if (loadMoUser()) return false
  wx.reLaunch({ url: PAGE_LOGIN })
  return true
}
