/** 与 app.json tabBar / reLaunch 路径保持一致，避免散落魔法字符串 */
export const TAB_MILESTONES = '/pages/milestones/milestones' as const

export const PAGE_LOGIN = '/pages/login/login' as const

/** `getCurrentPages()[].route` 形式（无前置 /） */
export const ROUTE_LOGIN = 'pages/login/login' as const
