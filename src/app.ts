// app.ts
import { loadMoUser, removeLegacyUnusedStorageKeys } from './utils/session'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    removeLegacyUnusedStorageKeys()
    if (wx.cloud) {
      wx.cloud.init({
        // 在云开发控制台创建环境后，可在此填写 env: '环境ID'；调试时不填则使用开发者工具当前关联的默认环境
        traceUser: true,
      })
    }
    const cached = loadMoUser()
    if (cached) {
      this.globalData.moUser = cached
    }

    setTimeout(() => {
      if (typeof wx.preloadSkylineView === 'function') {
        wx.preloadSkylineView({})
      }
    }, 400)
  },
})