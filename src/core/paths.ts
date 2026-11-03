export const TAB_MILESTONES = '/pages/milestones/milestones'
export const TAB_ORDER = '/pages/order/order'
export const TAB_RESONANCE = '/pages/resonance/resonance'
export const TAB_PROFILE = '/pages/profile/profile'
export const PAGE_LOGIN = '/pages/login/login'

export const PAGE_EDIT_PROFILE = '/subpackages/user/edit-profile/edit-profile'
export const PAGE_PREFERENCES = '/subpackages/user/preferences/preferences'
export const PAGE_LEDGER_VISIBILITY = '/subpackages/user/ledger-visibility/ledger-visibility'
export const PAGE_PARTNER_HUB = '/subpackages/user/partner-hub/partner-hub'

export const PAGE_REPORT_COMPOSE = '/subpackages/resonance/report-compose/report-compose'
export const PAGE_REPORT_DETAIL = '/subpackages/resonance/report-detail/report-detail'

export const PAGE_LETTER_LIST = '/pages/letters/letters'
export const PAGE_LETTER_COMPOSE = '/subpackages/letters/letter-compose/letter-compose'
export const PAGE_LETTER_DETAIL = '/subpackages/letters/letter-detail/letter-detail'

export const PAGE_LEDGER = '/subpackages/ledger/home/home'
export const PAGE_LEDGER_COMPOSE = '/subpackages/ledger/compose/compose'
export const PAGE_LEDGER_DETAIL = '/subpackages/ledger/detail/detail'
export const PAGE_LEDGER_CATEGORY = '/subpackages/ledger/category/category'

export const PAGE_KITCHEN_CREATE = '/subpackages/kitchen/create/create'
export const PAGE_KITCHEN_OPS = '/subpackages/kitchen/ops/ops'
export const PAGE_KITCHEN_MENU = '/subpackages/kitchen/menu/menu'
export const PAGE_KITCHEN_DISH = '/subpackages/kitchen/dish/dish'
export const PAGE_KITCHEN_CATEGORIES = '/subpackages/kitchen/categories/categories'
export const PAGE_KITCHEN_CHECKOUT = '/subpackages/kitchen/checkout/checkout'
export const PAGE_KITCHEN_ORDERS = '/subpackages/kitchen/orders/orders'

const TABS = [TAB_MILESTONES, TAB_ORDER, TAB_RESONANCE, TAB_PROFILE]

/** 子页面返回；没有上一页（直达进入）时打开 fallback */
export function back(fallback: string = TAB_MILESTONES): void {
  if (getCurrentPages().length > 1) wx.navigateBack()
  else if (TABS.includes(fallback)) wx.switchTab({ url: fallback })
  else wx.redirectTo({ url: fallback })
}
