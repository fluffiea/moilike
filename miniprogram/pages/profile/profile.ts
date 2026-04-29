type SettingId = 'editProfile' | 'changePassword' | 'preferences'

const SETTING_TITLES: Record<SettingId, string> = {
  editProfile: '编辑资料',
  changePassword: '修改密码',
  preferences: '偏好设置',
}

Component({
  data: {
    avatarUrl: '/images/default.png',
    nickName: '未设置昵称',
    handle: '@未设置',
    signature: '写点什么介绍自己吧。',
    tagLine: '✦ Moilike · 只属于我们两个人 ✦',
    settingsRows: [
      { id: 'editProfile', label: '编辑资料', icon: '✨' },
      { id: 'changePassword', label: '修改密码', icon: '🔒' },
      { id: 'preferences', label: '偏好设置', icon: '☰' },
    ],
  },
  methods: {
    onSettingTap(e: WechatMiniprogram.TouchEvent) {
      const id = e.currentTarget.dataset.id as SettingId | undefined
      const title = id && id in SETTING_TITLES ? SETTING_TITLES[id] : '该功能'
      wx.showToast({ title: `${title}，敬请期待`, icon: 'none' })
    },
    onLogoutTap() {
      wx.showToast({ title: '敬请期待', icon: 'none' })
    },
  },
})
