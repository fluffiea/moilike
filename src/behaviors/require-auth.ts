import { redirectIfNotAuthed } from '../utils/auth-guard'

/** 页面显示时若未登录则重定向登录页（与原先各页 pageLifetimes.show 逻辑一致） */
export default Behavior({
  pageLifetimes: {
    show() {
      redirectIfNotAuthed()
    },
  },
})
