/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    userInfo?: WechatMiniprogram.UserInfo
    moUser?: import('../miniprogram/types/user').MoUser
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback
}