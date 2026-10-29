import { CLOUD_ENV_ID } from './constants/env'
import { loadMoUser } from './utils/session'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    try {
      wx.removeStorageSync('mo_wait_explicit_relogin')
    } catch {
      // 旧版退出标记，V1 不再使用
    }
    if (wx.cloud) {
      const options: ICloudConfig = { traceUser: true }
      if (CLOUD_ENV_ID) options.env = CLOUD_ENV_ID
      wx.cloud.init(options)
    }
    const cached = loadMoUser()
    if (cached) this.globalData.moUser = cached
    setTimeout(() => {
      if (typeof wx.preloadSkylineView === 'function') wx.preloadSkylineView({})
    }, 400)
    if (typeof wx.hideShareMenu === 'function') {
      wx.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] })
    }
  },
})
