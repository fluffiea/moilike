import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import type { UserCloudResult } from '../../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../../types/cloud'
import { TAB_PROFILE } from '../../../constants/paths'
import { formatUserCloudBizError, showCloudInvokeErrorToast } from '../../../utils/cloud-invoke'
import moSession from '../../../utils/session'
import type { MoPreferences } from '../../../types/user'
import {
  DEFAULT_CHRONICLE_MAIN_TAB,
  DEFAULT_CHRONICLE_REPORT_FILTER,
  resolveChronicleEntryPrefs,
} from '../../../constants/chronicle-preferences'

type MainTabPref = 'daily' | 'report'
type ReportFilterPref = 'pending' | 'all' | 'mine'

function reportFilterToIndex(f: ReportFilterPref): number {
  if (f === 'pending') return 0
  if (f === 'all') return 1
  return 2
}

Component({
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.loadFormFromSession()
    },
  },
  data: {
    chronicleMainTab: DEFAULT_CHRONICLE_MAIN_TAB as MainTabPref,
    chronicleReportFilter: DEFAULT_CHRONICLE_REPORT_FILTER as ReportFilterPref,
    /** 报备滑块 0/1/2，与见证页 reportFilterIndex 一致 */
    reportFilterIndex: 0,
    submitting: false,
  },
  methods: {
    loadFormFromSession() {
      const u = moSession.loadMoUser()
      const prefs = u ? u.preferences : undefined
      const { mainModule, reportFilter } = resolveChronicleEntryPrefs(prefs)
      this.setData({
        chronicleMainTab: mainModule,
        chronicleReportFilter: reportFilter,
        reportFilterIndex: reportFilterToIndex(reportFilter),
      })
    },

    onPickMainTab(e: WechatMiniprogram.TouchEvent) {
      const tab = e.currentTarget.dataset.tab as MainTabPref | undefined
      if (tab !== 'daily' && tab !== 'report') return
      this.setData({ chronicleMainTab: tab })
    },

    onPickReportFilter(e: WechatMiniprogram.TouchEvent) {
      const f = e.currentTarget.dataset.filter as ReportFilterPref | undefined
      if (f !== 'pending' && f !== 'all' && f !== 'mine') return
      this.setData({ chronicleReportFilter: f, reportFilterIndex: reportFilterToIndex(f) })
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_PROFILE })
        },
      })
    },

    async onSave() {
      if (!wx.cloud) {
        wx.showToast({ title: '当前环境不支持云开发', icon: 'none' })
        return
      }
      if (this.data.submitting) return
      this.setData({ submitting: true })
      wx.showLoading({ title: '保存中' })
      try {
        const preferences: MoPreferences = {
          chronicleDefaultMainTab: this.data.chronicleMainTab,
          chronicleReportFilter: this.data.chronicleReportFilter,
        }
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: {
            action: 'syncPreferences',
            preferences,
          },
        })
        const result = res.result as UserCloudResult | undefined
        if (!result || result.ok !== true) {
          const raw =
            result && result.ok === false && result.error != null ? result.error : '保存失败'
          wx.showToast({ title: formatUserCloudBizError(raw), icon: 'none', duration: 4500 })
          return
        }
        if (!result.user) {
          wx.showToast({ title: '同步后未返回用户数据', icon: 'none' })
          return
        }
        moSession.saveMoUser(result.user)
        wx.navigateBack({
          fail: () => {
            wx.switchTab({ url: TAB_PROFILE })
          },
        })
      } catch (err) {
        showCloudInvokeErrorToast(err)
      } finally {
        wx.hideLoading()
        this.setData({ submitting: false })
      }
    },
  },
})
