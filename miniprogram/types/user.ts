/** 伴侣资料快照（列表/卡片展示用；绑定关系以 partnerOpenId 为准） */
export type MoPartner = {
  openId: string
  nickName: string
  avatarUrl?: string
  signature?: string
}

export type MoUser = {
  openId: string
  nickName: string
  signature: string
  /** 云存储 fileID（cloud://）或 https，与微信头像同步时一般为上传后的 fileID */
  avatarUrl?: string
  partnerOpenId?: string | null
  partner: MoPartner | null
}
