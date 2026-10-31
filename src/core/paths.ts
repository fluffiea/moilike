export const TAB_MILESTONES = '/pages/milestones/milestones'
export const TAB_MOMENTS = '/pages/moments/moments'
export const TAB_RESONANCE = '/pages/resonance/resonance'
export const TAB_PROFILE = '/pages/profile/profile'
export const PAGE_LOGIN = '/pages/login/login'

export const PAGE_EDIT_PROFILE = '/subpackages/user/edit-profile/edit-profile'
export const PAGE_PREFERENCES = '/subpackages/user/preferences/preferences'
export const PAGE_PARTNER_HUB = '/subpackages/user/partner-hub/partner-hub'

export const PAGE_DAILY_COMPOSE = '/subpackages/moments/daily-compose/daily-compose'
export const PAGE_DAILY_DETAIL = '/subpackages/moments/daily-detail/daily-detail'

export const PAGE_REPORT_COMPOSE = '/subpackages/resonance/report-compose/report-compose'
export const PAGE_REPORT_DETAIL = '/subpackages/resonance/report-detail/report-detail'

export const PAGE_LETTER_LIST = '/subpackages/letters/letter-list/letter-list'
export const PAGE_LETTER_COMPOSE = '/subpackages/letters/letter-compose/letter-compose'
export const PAGE_LETTER_DETAIL = '/subpackages/letters/letter-detail/letter-detail'

const TABS = [TAB_MILESTONES, TAB_MOMENTS, TAB_RESONANCE, TAB_PROFILE]

/** 子页面返回；没有上一页（直达进入）时打开 fallback */
export function back(fallback: string = TAB_MILESTONES): void {
  if (getCurrentPages().length > 1) wx.navigateBack()
  else if (TABS.includes(fallback)) wx.switchTab({ url: fallback })
  else wx.redirectTo({ url: fallback })
}
