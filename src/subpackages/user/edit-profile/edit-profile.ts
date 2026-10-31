import { call } from '../../../core/api'
import { uploadFile } from '../../../core/media'
import { TAB_PROFILE, back } from '../../../core/paths'
import { getUser, setUser } from '../../../core/store'
import { toast, toastDone } from '../../../core/ui'

type Data = { avatarSrc: string; nickName: string; signature: string; submitting: boolean }

Component<Data, {}, WechatMiniprogram.Component.MethodOption, { avatarChanged: boolean }, true>({
  data: { avatarSrc: '', nickName: '', signature: '', submitting: false },
  methods: {
    onLoad() {
      this.avatarChanged = false
      const u = getUser()
      if (u) this.setData({ avatarSrc: u.avatarUrl, nickName: u.nickName, signature: u.signature })
    },
    onChooseAvatar(e: WechatMiniprogram.CustomEvent<{ avatarUrl: string }>) {
      if (!e.detail.avatarUrl) return
      this.avatarChanged = true
      this.setData({ avatarSrc: e.detail.avatarUrl })
    },
    onNick(e: WechatMiniprogram.Input) {
      this.setData({ nickName: e.detail.value })
    },
    onSignature(e: WechatMiniprogram.Input) {
      this.setData({ signature: e.detail.value })
    },

    async onSave() {
      const u = getUser()
      const nickName = this.data.nickName.trim()
      if (!u) return
      if (!nickName) return toast('请填写昵称')
      this.setData({ submitting: true })
      try {
        const avatarFileId = this.avatarChanged ? await uploadFile('avatars', this.data.avatarSrc) : u.avatarFileId
        const r = await call('user.saveProfile', { nickName, avatarFileId, signature: this.data.signature.trim() })
        if (!r.ok) return toast(r.message)
        setUser(r.data.user)
        toastDone('已保存')
        back(TAB_PROFILE)
      } catch {
        toast('头像上传失败，请重试')
      } finally {
        this.setData({ submitting: false })
      }
    },
  },
})
