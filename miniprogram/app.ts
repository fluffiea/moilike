// app.ts
import { loadMoUser } from './utils/session'

App<IAppOption>({
  globalData: {},
  onLaunch() {
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
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    setTimeout(() => {
      if (typeof wx.preloadSkylineView === 'function') {
        wx.preloadSkylineView({})
      }
    }, 400)
  },
})