export type MoPartner = {
  openId: string
  nickName: string
  avatarUrl: string
  avatarDisplay: string
}

export type MoUser = {
  openId: string
  nickName: string
  avatarUrl: string
  avatarDisplay: string
  partnerOpenId: string | null
  partner: MoPartner | null
  paired: boolean
}
