import { call } from '../../core/api'
import { uploadFile } from '../../core/media'
import { TAB_MILESTONES } from '../../core/paths'
import { clearLoggedOut, isLoggedOut, isRegistered, setUser } from '../../core/store'
import { toast } from '../../core/ui'

type Data = {
  phase: 'checking' | 'form'
  nickName: string
  avatarSrc: string
  submitting: boolean
}

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { avatarFileId: string; avatarChanged: boolean }, true>({
  data: {
    phase: 'checking',
    nickName: '',
    avatarSrc: '',
    submitting: false,
  },
  methods: {
    async onLoad() {
      this.avatarFileId = ''
      this.avatarChanged = false
      const r = await call('user.me', {})
      if (r.ok && isRegistered(r.data.user) && !isLoggedOut()) {
        setUser(r.data.user)
        wx.switchTab({ url: TAB_MILESTONES })
        return
      }
      // 退出登录后不自动进入，但把云端资料预填好，一键即可恢复
      const u = r.ok ? r.data.user : null
      if (u) this.avatarFileId = u.avatarFileId
      this.setData({ phase: 'form', nickName: u ? u.nickName : '', avatarSrc: u ? u.avatarUrl : '' })
      if (!r.ok) toast(r.message)
      // 昵称输入框在未同意隐私协议时不会触发授权弹窗，进入表单时主动拉起
      if (typeof wx.requirePrivacyAuthorize === 'function') wx.requirePrivacyAuthorize({ fail: () => {} })
    },

    onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
      if (!e.detail.avatarUrl) return
      this.avatarChanged = true
      this.setData({ avatarSrc: e.detail.avatarUrl })
    },

    onNickInput(e: WechatMiniprogram.Input) {
      this.setData({ nickName: e.detail.value })
    },

    async onSubmit() {
      const nickName = this.data.nickName.trim()
      if (!nickName) return toast('请填写昵称')
      if (!this.avatarChanged && !this.avatarFileId) return toast('请选择头像')
      this.setData({ submitting: true })
      try {
        const avatarFileId = this.avatarChanged ? await uploadFile('avatars', this.data.avatarSrc) : this.avatarFileId
        const r = await call('user.saveProfile', { nickName, avatarFileId })
        if (!r.ok) return toast(r.message)
        clearLoggedOut()
        setUser(r.data.user)
        wx.switchTab({ url: TAB_MILESTONES })
      } catch {
        toast('头像上传失败，请重试')
      } finally {
        this.setData({ submitting: false })
      }
    },
  },
})
