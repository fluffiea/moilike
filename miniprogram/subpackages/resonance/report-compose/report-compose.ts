import requireAuth from '../../../behaviors/require-auth'
import type { ReportPostPublic } from '../../../types/cloud'
import { formatCloudBizError } from '../../../utils/cloud-invoke'
import {
  floorToMinuteMs,
  formatMsToDateStr,
  formatMsToTimeStr,
  parseLocalDateTimeToMs,
} from '../../../utils/together-since'
import {
  reportAddTag,
  reportCreate,
  reportGetReport,
  reportListTags,
  reportMapMediaTempUrls,
  reportUpdate,
} from '../../../utils/api/report-api'
import { takeReportEditStaging } from '../../../utils/report-edit-staging'
import { uploadReportImagesIfNeeded } from '../../../utils/upload/report-upload'
import { TAB_RESONANCE } from '../../../constants/paths'

const MAX_IMAGES = 9
const MAX_BODY = 2000
const DEFAULT_TAG = '干饭'

const MODULE_NOW_MS = Date.now()
const DEFAULT_RECORD_DATE_STR = formatMsToDateStr(MODULE_NOW_MS)
const DEFAULT_RECORD_TIME_STR = formatMsToTimeStr(MODULE_NOW_MS)

type TagRow = { name: string; selected: boolean }

type ReportComposeData = {
  navTitle: string
  heroKicker: string
  editId: string
  textareaMountKey: string
  text: string
  images: string[]
  imageDisplays: string[]
  canSubmit: boolean
  recordDateStr: string
  recordTimeStr: string
  recordTimeModified: boolean
  tagOptions: string[]
  selectedTags: string[]
  tagRows: TagRow[]
  newTagDraft: string
}

interface ReportComposeCustomInstanceProperty {
  _reportComposeBootstrappedId: string
  _skipAlbumTapUntil: number
}

type ReportComposeMethods = WechatMiniprogram.Component.MethodOption

function reportBizErr(r: { ok?: boolean; error?: string } | null | undefined): string {
  if (r && r.ok === false) return formatCloudBizError(r.error)
  return '操作失败'
}

Component<ReportComposeData, {}, ReportComposeMethods, ReportComposeCustomInstanceProperty>({
  behaviors: [requireAuth],
  data: {
    navTitle: '写报备',
    heroKicker: '记下此刻，对方会在共鸣里收到。',
    editId: '',
    textareaMountKey: 'report-new',
    text: '',
    images: [],
    imageDisplays: [],
    canSubmit: false,
    recordDateStr: DEFAULT_RECORD_DATE_STR,
    recordTimeStr: DEFAULT_RECORD_TIME_STR,
    recordTimeModified: false,
    tagOptions: [],
    selectedTags: [DEFAULT_TAG],
    tagRows: [],
    newTagDraft: '',
  },
  lifetimes: {
    attached() {
      void this.initTagOptions()
      this.initRecordPickers()
    },
    ready() {
      if (this.data.editId) return
      try {
        const pages = getCurrentPages()
        const top = pages[pages.length - 1] as { options?: Record<string, string | undefined> }
        if (top && top.options) {
          this.bootstrapEditFromQuery(top.options)
        }
      } catch {
        // ignore
      }
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      this.bootstrapEditFromQuery(options)
    },
  },
  methods: {
    initRecordPickers() {
      const now = Date.now()
      this.setData({
        recordDateStr: formatMsToDateStr(now),
        recordTimeStr: formatMsToTimeStr(now),
      })
    },

    rebuildTagRows() {
      const opts = this.data.tagOptions
      const sel = this.data.selectedTags
      const rows: TagRow[] = opts.map((name) => ({
        name,
        selected: sel.indexOf(name) >= 0,
      }))
      this.setData({ tagRows: rows })
    },

    async initTagOptions() {
      const r = await reportListTags()
      if (!r || r.ok !== true || !Array.isArray(r.tags)) {
        this.setData({ tagOptions: [DEFAULT_TAG], selectedTags: [DEFAULT_TAG] })
        this.rebuildTagRows()
        return
      }
      const tags = r.tags
      let selected = this.data.selectedTags
      if (!Array.isArray(selected) || selected.length === 0) {
        if (tags.indexOf(DEFAULT_TAG) >= 0) {
          selected = [DEFAULT_TAG]
        } else if (tags.length > 0) {
          selected = [tags[0]]
        } else {
          selected = []
        }
      }
      const filtered = selected.filter((t) => tags.indexOf(t) >= 0)
      let nextSel: string[]
      if (filtered.length > 0) {
        nextSel = filtered
      } else if (tags.indexOf(DEFAULT_TAG) >= 0) {
        nextSel = [DEFAULT_TAG]
      } else {
        nextSel = []
      }
      this.setData({ tagOptions: tags, selectedTags: nextSel })
      this.rebuildTagRows()
    },

    bootstrapEditFromQuery(query: Record<string, string | undefined> | undefined): boolean {
      if (!query || typeof query !== 'object') return false
      const rawId = query.id
      if (!rawId || typeof rawId !== 'string') return false
      let id: string
      try {
        id = decodeURIComponent(rawId)
      } catch {
        return false
      }
      if (!id) return false

      if (this._reportComposeBootstrappedId === id) return true

      const staged = takeReportEditStaging(id)
      const patch: WechatMiniprogram.IAnyObject = {
        editId: id,
        navTitle: '编辑报备',
        heroKicker: '修改内容、记录时间或标签后保存。',
        textareaMountKey: `${id}-boot-${Date.now()}`,
      }
      if (staged) {
        patch.text = staged.text
        const onlyCloud = staged.images.filter(
          (u) => typeof u === 'string' && u.indexOf('cloud://') === 0,
        )
        if (onlyCloud.length > 0) {
          const imgs = onlyCloud.slice(0, MAX_IMAGES)
          patch.images = imgs
          patch.imageDisplays = imgs.slice()
        }
        const im = (patch.images as string[]) || []
        patch.canSubmit = staged.text.trim().length > 0 || im.length > 0
      }

      this.setData(patch)
      this._reportComposeBootstrappedId = id

      wx.nextTick(() => {
        void this.loadEditDraft(id)
      })
      return true
    },

    async loadEditDraft(id: string) {
      if (!wx.cloud) {
        wx.showToast({ title: '云开发不可用', icon: 'none' })
        return
      }
      wx.showLoading({ title: '加载中', mask: true })
      try {
        const r = await reportGetReport(id)
        if (!r || !r.ok || !r.post) {
          if ((this.data.text || '').trim().length === 0 && (!this.data.images || this.data.images.length === 0)) {
            wx.showToast({
              title: reportBizErr(r),
              icon: 'none',
            })
          }
          return
        }
        const p = r.post
        if (!p.isMine) {
          wx.showToast({ title: '只能编辑自己的报备', icon: 'none' })
          setTimeout(() => {
            wx.navigateBack({
              fail: () => {
                wx.switchTab({ url: TAB_RESONANCE })
              },
            })
          }, 600)
          return
        }
        const body = typeof p.body === 'string' ? p.body : ''
        const tags = Array.isArray(p.tags) ? p.tags.slice() : []
        const imagesRaw = Array.isArray(p.images) ? p.images.slice(0, MAX_IMAGES) : []
        const mediaMap = await reportMapMediaTempUrls(imagesRaw)
        const imageDisplays = imagesRaw.map((img) =>
          typeof img === 'string' ? mediaMap.get(img) || img : img,
        )
        let recordDateStr = this.data.recordDateStr
        let recordTimeStr = this.data.recordTimeStr
        const msRaw = p.recordAtMs
        if (typeof msRaw === 'number' && !Number.isNaN(msRaw)) {
          recordDateStr = formatMsToDateStr(msRaw)
          recordTimeStr = formatMsToTimeStr(msRaw)
        }
        const canSubmit = body.trim().length > 0 || imagesRaw.length > 0 || tags.length > 0
        await this.initTagOptions()
        this.setData({
          text: body,
          images: imagesRaw,
          imageDisplays,
          selectedTags: tags.length > 0 ? tags : [DEFAULT_TAG],
          recordDateStr,
          recordTimeStr,
          recordTimeModified: true,
          canSubmit,
          textareaMountKey: `${id}-cloud-${Date.now()}`,
        })
        this.rebuildTagRows()
      } finally {
        wx.hideLoading()
      }
    },

    syncCanSubmit() {
      const ok =
        this.data.text.trim().length > 0 || this.data.images.length > 0 || this.data.selectedTags.length > 0
      if (ok !== this.data.canSubmit) this.setData({ canSubmit: ok })
    },

    onTextInput() {
      this.syncCanSubmit()
    },

    onRecordDateChange(e: WechatMiniprogram.PickerChange) {
      const val = e.detail && typeof e.detail.value === 'string' ? e.detail.value : ''
      if (val) this.setData({ recordDateStr: val, recordTimeModified: true })
    },

    onRecordTimeChange(e: WechatMiniprogram.PickerChange) {
      const val = e.detail && typeof e.detail.value === 'string' ? e.detail.value : ''
      if (val) this.setData({ recordTimeStr: val, recordTimeModified: true })
    },

    onToggleTag(e: WechatMiniprogram.TouchEvent) {
      const tag = e.currentTarget.dataset.tag as string | undefined
      if (!tag || typeof tag !== 'string') return
      const sel = this.data.selectedTags.slice()
      const idx = sel.indexOf(tag)
      if (idx >= 0) {
        sel.splice(idx, 1)
      } else {
        sel.push(tag)
      }
      this.setData({ selectedTags: sel })
      this.rebuildTagRows()
      this.syncCanSubmit()
    },

    onNewTagInput(e: WechatMiniprogram.Input) {
      this.setData({ newTagDraft: e.detail.value || '' })
    },

    async onAddCustomTag() {
      const raw = (this.data.newTagDraft || '').trim()
      if (!raw) {
        wx.showToast({ title: '请先输入标签', icon: 'none' })
        return
      }
      const r = await reportAddTag(raw)
      if (!r || r.ok !== true || !Array.isArray(r.tags)) {
        wx.showToast({ title: reportBizErr(r), icon: 'none' })
        return
      }
      const tags = r.tags
      const sel = this.data.selectedTags.slice()
      if (sel.indexOf(raw) < 0) {
        sel.push(raw)
      }
      this.setData({
        tagOptions: tags,
        selectedTags: sel,
        newTagDraft: '',
      })
      this.rebuildTagRows()
      this.syncCanSubmit()
      wx.showToast({ title: '已添加', icon: 'none' })
    },

    onAddImagesFromAlbum() {
      if (Date.now() < this._skipAlbumTapUntil) return
      this.pickImages(['album'])
    },

    onAddImagesFromCamera() {
      this._skipAlbumTapUntil = Date.now() + 480
      this.pickImages(['camera'], 1)
    },

    pickImages(sourceType: Array<'album' | 'camera'>, maxCount?: number) {
      const remain = MAX_IMAGES - this.data.images.length
      if (remain <= 0) return
      const count = maxCount != null ? Math.min(maxCount, remain) : remain
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType,
        success: (res) => {
          const next = res.tempFiles.map((f) => f.tempFilePath)
          const merged = [...this.data.images, ...next].slice(0, MAX_IMAGES)
          const mergedD = [...this.data.imageDisplays, ...next].slice(0, MAX_IMAGES)
          this.setData({
            images: merged,
            imageDisplays: mergedD,
          })
          this.syncCanSubmit()
        },
      })
    },

    onRemoveImage(e: WechatMiniprogram.TouchEvent) {
      const idx = Number(e.currentTarget.dataset.index)
      if (Number.isNaN(idx)) return
      const images = [...this.data.images]
      const imageDisplays = [...this.data.imageDisplays]
      images.splice(idx, 1)
      imageDisplays.splice(idx, 1)
      this.setData({ images, imageDisplays })
      this.syncCanSubmit()
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: TAB_RESONANCE })
        },
      })
    },

    async onSubmit() {
      if (!this.data.canSubmit) {
        wx.showToast({ title: '写点内容、选标签或配图', icon: 'none' })
        return
      }
      const { text, images, editId, recordDateStr, recordTimeStr, selectedTags } = this.data
      const body = text.trim().slice(0, MAX_BODY)
      const parsed = parseLocalDateTimeToMs(recordDateStr, recordTimeStr)
      if (!Number.isFinite(parsed)) {
        wx.showToast({ title: '请先选齐记录日期与时间', icon: 'none' })
        return
      }
      const recordAtMs = floorToMinuteMs(parsed)
      if (!Number.isFinite(recordAtMs)) {
        wx.showToast({ title: '记录时间无效', icon: 'none' })
        return
      }
      const tags = (selectedTags || []).filter((t) => typeof t === 'string' && t.trim().length > 0)
      wx.showLoading({ title: editId ? '保存中' : '提交中', mask: true })
      try {
        let fileIds: string[]
        try {
          fileIds = await uploadReportImagesIfNeeded(images)
        } catch (e) {
          const msg = e instanceof Error ? e.message : '图片上传失败'
          wx.showToast({ title: msg, icon: 'none' })
          return
        }
        const result = editId
          ? await reportUpdate(editId, body, fileIds, tags, recordAtMs)
          : await reportCreate(body, fileIds, tags, recordAtMs)
        if (!result) return
        if (!result.ok) {
          wx.showToast({ title: reportBizErr(result), icon: 'none' })
          return
        }
        if (!result.post) {
          wx.showToast({ title: '保存失败', icon: 'none' })
          return
        }
        const post: ReportPostPublic = result.post
        const ch = this.getOpenerEventChannel()
        if (ch && typeof ch.emit === 'function') {
          ch.emit('reportPublished', {
            mode: editId ? 'edit' : 'create',
            post,
          })
        }
        wx.showToast({ title: editId ? '已保存' : '已发布', icon: 'success', duration: 900 })
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: TAB_RESONANCE })
            },
          })
        }, 320)
      } finally {
        wx.hideLoading()
      }
    },
  },
})
