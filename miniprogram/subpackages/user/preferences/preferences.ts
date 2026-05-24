import { redirectIfNotAuthed } from '../../../utils/auth-guard'
import type { UserCloudResult } from '../../../types/cloud'
import { USER_CLOUD_FUNCTION } from '../../../types/cloud'
import { TAB_PROFILE } from '../../../constants/paths'
import moSession from '../../../utils/session'
import type { MoPreferences } from '../../../types/user'
import {
  DEFAULT_RESONANCE_REPORT_FILTER,
  resolveResonanceReportFilter,
} from '../../../constants/resonance-preferences'

type ReportFilterPref = 'mine' | 'action_needed' | 'all'

interface PreferencesCustomInstanceProperty {
  _saving: boolean
}

function reportFilterToIndex(f: ReportFilterPref): number {
  if (f === 'mine') return 0
  if (f === 'action_needed') return 1
  return 2
}

Component<{}, {}, {}, PreferencesCustomInstanceProperty>({
  pageLifetimes: {
    show() {
      if (redirectIfNotAuthed()) return
      this.loadFormFromSession()
    },
  },
  data: {
    resonanceReportFilter: DEFAULT_RESONANCE_REPORT_FILTER as ReportFilterPref,
    reportFilterIndex: 0,
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
      if (f !== 'mine' && f !== 'action_needed' && f !== 'all') return
      if (this.data.resonanceReportFilter === f) return
      if (this._saving) return
      const prev = this.data.resonanceReportFilter
      this.setData({ resonanceReportFilter: f, reportFilterIndex: reportFilterToIndex(f) })
      void this.savePreference(f, prev)
    },

    async savePreference(current: ReportFilterPref, previous: ReportFilterPref) {
      if (!wx.cloud) return
      this._saving = true
      try {
        const preferences: MoPreferences = {
          resonanceReportFilter: current,
        }
        const res = await wx.cloud.callFunction({
          name: USER_CLOUD_FUNCTION,
          data: {
            action: 'syncPreferences',
            preferences,
          },
        })
        const result = res.result as UserCloudResult | undefined
        if (result && result.ok === true && result.user) {
          moSession.saveMoUser(result.user)
          return
        }
        wx.showToast({ title: '设置未保存，请重试', icon: 'none' })
        this.setData({
          resonanceReportFilter: previous,
          reportFilterIndex: reportFilterToIndex(previous),
        })
      } catch (_e) {
        wx.showToast({ title: '设置未保存，请重试', icon: 'none' })
        this.setData({
          resonanceReportFilter: previous,
          reportFilterIndex: reportFilterToIndex(previous),
        })
      } finally {
        this._saving = false
      }
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_PROFILE })
        },
      })
    },
  },
})
