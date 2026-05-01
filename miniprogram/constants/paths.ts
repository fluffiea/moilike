/** 与 app.json tabBar / reLaunch 路径保持一致，避免散落魔法字符串 */
export const TAB_MILESTONES = '/pages/milestones/milestones' as const

/** 独白 Tab（编辑页 navigateBack 失败时兜底） */
export const TAB_PROFILE = '/pages/profile/profile' as const

export const PAGE_LOGIN = '/pages/login/login' as const

/** `getCurrentPages()[].route` 形式（无前置 /） */
export const ROUTE_LOGIN = 'pages/login/login' as const

/** 编辑资料（独白入口 navigateTo · 分包 user） */
export const PAGE_EDIT_PROFILE = '/subpackages/user/edit-profile/edit-profile' as const

/** 偏好设置（独白入口 navigateTo · 分包 user） */
export const PAGE_PREFERENCES = '/subpackages/user/preferences/preferences' as const

/** 写日常 / 编辑日常（见证入口 navigateTo · 分包 chronicle） */
export const PAGE_DAILY_COMPOSE = '/subpackages/chronicle/daily-compose/daily-compose' as const
