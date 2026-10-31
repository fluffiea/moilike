import { initStore } from './core/store'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    wx.cloud.init({ traceUser: true })
    initStore()
    // 首屏渲染后再预热下一个 Skyline 页面环境，缩短第一次跳转耗时
    setTimeout(() => {
      if (typeof wx.preloadSkylineView === 'function') wx.preloadSkylineView({})
    }, 400)
  },
})
