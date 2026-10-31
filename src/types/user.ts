/** 伴侣资料快照（列表/卡片展示用；绑定关系以 partnerOpenId 为准） */
export type MoPartner = {
  openId: string
  nickName: string
  avatarUrl?: string
  signature?: string
}

/** 偏好；保存在云端 users.preferences */
export type MoPreferences = {
  /** 进入「共鸣」Tab 时报备列表的默认筛选 */
  resonanceReportFilter?: 'mine' | 'action_needed' | 'all'
}

export type MoUser = {
  openId: string
  nickName: string
  signature: string
  /** 云存储 fileID（cloud://）或 https，与微信头像同步时一般为上传后的 fileID */
  avatarUrl?: string
  partnerOpenId?: string | null
  partner: MoPartner | null
  /**
   * 结伴双方约定的「在一起」起始 UTC 毫秒（云库存分钟对齐）；getProfile / getPartnerPanel 返回。
   */
  togetherSinceMs?: number
  /** 偏好设置（按用户持久化） */
  preferences?: MoPreferences | null
  /** 报备自定义标签（云函数 listReportTags 会与默认「干饭」合并） */
  reportTags?: string[]
}
