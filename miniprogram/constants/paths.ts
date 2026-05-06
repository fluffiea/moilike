/** 与 app.json tabBar / reLaunch 路径保持一致，避免散落魔法字符串 */
export const TAB_MILESTONES = '/pages/milestones/milestones' as const

/** 浮生 Tab（日常流） */
export const TAB_MOMENTS = '/pages/moments/moments' as const

/** 共鸣 Tab（报备流） */
export const TAB_RESONANCE = '/pages/resonance/resonance' as const

/** 独白 Tab（编辑页 navigateBack 失败时兜底） */
export const TAB_PROFILE = '/pages/profile/profile' as const

export const PAGE_LOGIN = '/pages/login/login' as const

/** `getCurrentPages()[].route` 形式（无前置 /） */
export const ROUTE_LOGIN = 'pages/login/login' as const

/** 编辑资料（独白入口 navigateTo · 分包 user） */
export const PAGE_EDIT_PROFILE = '/subpackages/user/edit-profile/edit-profile' as const

/** 偏好设置（独白入口 navigateTo · 分包 user） */
export const PAGE_PREFERENCES = '/subpackages/user/preferences/preferences' as const

/** 对象与绑定（独白摘要入口 navigateTo · 分包 user） */
export const PAGE_PARTNER_HUB = '/subpackages/user/partner-hub/partner-hub' as const

/** 写日常 / 编辑日常（浮生 Tab navigateTo · 分包 moments） */
export const PAGE_DAILY_COMPOSE = '/subpackages/moments/daily-compose/daily-compose' as const

/** 日常详情（列表卡片 navigateTo · 分包 moments） */
export const PAGE_DAILY_DETAIL = '/subpackages/moments/daily-detail/daily-detail' as const

/** 写报备 / 编辑报备（共鸣 Tab navigateTo · 分包 resonance） */
export const PAGE_REPORT_COMPOSE = '/subpackages/resonance/report-compose/report-compose' as const

/** 报备详情（对象已阅/评价 · 分包 resonance） */
export const PAGE_REPORT_DETAIL = '/subpackages/resonance/report-detail/report-detail' as const
