import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import type { UserCloudResult } from '../../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../../types/cloud'
import { TAB_PROFILE } from '../../../constants/paths'
import { formatUserCloudBizError, showCloudInvokeErrorToast } from '../../../utils/cloud-invoke'
import moSession from '../../../utils/session'
import type { MoPreferences } from '../../../types/user'
import {
  DEFAULT_RESONANCE_REPORT_FILTER,
  resolveResonanceReportFilter,
} from '../../../constants/resonance-preferences'

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
    resonanceReportFilter: DEFAULT_RESONANCE_REPORT_FILTER as ReportFilterPref,
    reportFilterIndex: 0,
    submitting: false,
  },
  methods: {
    loadFormFromSession() {
      const u = moSession.loadMoUser()
      const prefs = u ? u.preferences : undefined
      const reportFilter = resolveResonanceReportFilter(prefs)
      this.setData({
        resonanceReportFilter: reportFilter,
        reportFilterIndex: reportFilterToIndex(reportFilter),
      })
    },

    onPickReportFilter(e: WechatMiniprogram.TouchEvent) {
      const f = e.currentTarget.dataset.filter as ReportFilterPref | undefined
      if (f !== 'pending' && f !== 'all' && f !== 'mine') return
      this.setData({ resonanceReportFilter: f, reportFilterIndex: reportFilterToIndex(f) })
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
          resonanceReportFilter: this.data.resonanceReportFilter,
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
