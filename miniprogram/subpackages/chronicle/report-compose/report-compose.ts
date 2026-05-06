import requireAuth from '../../../behaviors/require-auth'
import type { ReportPostPublic } from '../../../types/cloud'
import { formatDailyCloudBizError } from '../../../utils/cloud-invoke'
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
} from '../../../utils/report-api'
import { takeReportEditStaging } from '../../../utils/report-edit-staging'
import { uploadReportImagesIfNeeded } from '../../../utils/report-upload'

const MAX_IMAGES = 9
const MAX_BODY = 2000
const DEFAULT_TAG = '干饭'

type TagRow = { name: string; selected: boolean }

type ComposePageThis = WechatMiniprogram.Component.Instance<
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject,
  WechatMiniprogram.IAnyObject
> & {
  getOpenerEventChannel?: () => WechatMiniprogram.EventChannel
}

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
  tagOptions: string[]
  selectedTags: string[]
  tagRows: TagRow[]
  newTagDraft: string
}

function reportBizErr(r: { ok?: boolean; error?: string } | null | undefined): string {
  if (r && r.ok === false) return formatDailyCloudBizError(r.error)
  return '操作失败'
}

Component({
  behaviors: [requireAuth],
  data: {
    navTitle: '写报备',
    heroKicker: '记下此刻，对方会在见证里收到。',
    editId: '',
    textareaMountKey: 'report-new',
    text: '',
    images: [] as string[],
    imageDisplays: [] as string[],
    canSubmit: false,
    recordDateStr: '',
    recordTimeStr: '',
    tagOptions: [] as string[],
    selectedTags: [DEFAULT_TAG] as string[],
    tagRows: [] as TagRow[],
    newTagDraft: '',
  },
  lifetimes: {
    attached() {
      void (this as WechatMiniprogram.IAnyObject).initTagOptions()
    },
    ready() {
      const self = this as ComposePageThis & {
        bootstrapEditFromQuery: (q: Record<string, string | undefined> | undefined) => boolean
      }
      if ((self.data as { editId?: string }).editId) {
        return
      }
      try {
        const pages = getCurrentPages()
        const top = pages[pages.length - 1] as { options?: Record<string, string | undefined> }
        if (top && top.options) {
          self.bootstrapEditFromQuery(top.options)
        }
      } catch {
        // ignore
      }
    },
  },
  pageLifetimes: {
    onLoad(options: Record<string, string | undefined>) {
      const self = this as ComposePageThis & {
        bootstrapEditFromQuery: (q: Record<string, string | undefined> | undefined) => boolean
      }
      const ch =
        typeof self.getOpenerEventChannel === 'function' ? self.getOpenerEventChannel() : null
      if (ch && typeof ch.on === 'function') {
        ch.on('reportComposeInit', (payload: { text?: string }) => {
          const t = typeof payload.text === 'string' ? payload.text : ''
          if (t.trim().length === 0) return
          const editId = (self.data as { editId?: string }).editId || ''
          const d = self.data as ReportComposeData
          const canSubmit =
            t.trim().length > 0 || d.images.length > 0 || d.selectedTags.length > 0
          self.setData({
            text: t,
            canSubmit,
            textareaMountKey: `${editId || 'new'}-ec-${Date.now()}`,
          })
        })
      }
      void self.initRecordPickers()
      self.bootstrapEditFromQuery(options)
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
      const d = this.data as ReportComposeData
      const opts = Array.isArray(d.tagOptions) ? d.tagOptions : []
      const sel = Array.isArray(d.selectedTags) ? d.selectedTags : []
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
      let selected = (this.data as ReportComposeData).selectedTags
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
      if (!query || typeof query !== 'object') {
        return false
      }
      const rawId = query.id
      if (!rawId || typeof rawId !== 'string') {
        return false
      }
      let id: string
      try {
        id = decodeURIComponent(rawId)
      } catch {
        return false
      }
      if (!id) {
        return false
      }

      const ext = this as WechatMiniprogram.IAnyObject
      if (ext._reportComposeBootstrappedId === id) {
        return true
      }

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
      ext._reportComposeBootstrappedId = id

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
          const d = this.data as ReportComposeData
          const hadLocal = (d.text || '').trim().length > 0 || (d.images && d.images.length > 0)
          if (!hadLocal) {
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
                wx.switchTab({ url: '/pages/chronicle/chronicle' })
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
        let recordDateStr = (this.data as ReportComposeData).recordDateStr
        let recordTimeStr = (this.data as ReportComposeData).recordTimeStr
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
          canSubmit,
          textareaMountKey: `${id}-cloud-${Date.now()}`,
        })
        this.rebuildTagRows()
      } finally {
        wx.hideLoading()
      }
    },

    syncCanSubmit() {
      const d = this.data as ReportComposeData
      const ok =
        d.text.trim().length > 0 || d.images.length > 0 || (d.selectedTags && d.selectedTags.length > 0)
      if (ok !== this.data.canSubmit) {
        this.setData({ canSubmit: ok })
      }
    },

    onTextInput() {
      this.syncCanSubmit()
    },

    onRecordDateChange(e: WechatMiniprogram.PickerChange) {
      const val = e.detail && typeof e.detail.value === 'string' ? e.detail.value : ''
      if (val) this.setData({ recordDateStr: val })
    },

    onRecordTimeChange(e: WechatMiniprogram.PickerChange) {
      const val = e.detail && typeof e.detail.value === 'string' ? e.detail.value : ''
      if (val) this.setData({ recordTimeStr: val })
    },

    onToggleTag(e: WechatMiniprogram.TouchEvent) {
      const tag = e.currentTarget.dataset.tag as string | undefined
      if (!tag || typeof tag !== 'string') return
      const d = this.data as ReportComposeData
      const sel = d.selectedTags.slice()
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
      const raw = ((this.data as ReportComposeData).newTagDraft || '').trim()
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
      const sel = (this.data as ReportComposeData).selectedTags.slice()
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
      const ext = this as unknown as { _skipAlbumTapUntil?: number }
      if (Date.now() < (ext._skipAlbumTapUntil || 0)) return
      this.pickImages(['album'])
    },

    onAddImagesFromCamera() {
      const ext = this as unknown as { _skipAlbumTapUntil?: number }
      ext._skipAlbumTapUntil = Date.now() + 480
      this.pickImages(['camera'], 1)
    },

    pickImages(sourceType: Array<'album' | 'camera'>, maxCount?: number) {
      const d = this.data as ReportComposeData
      const remain = MAX_IMAGES - d.images.length
      if (remain <= 0) return
      const count = maxCount != null ? Math.min(maxCount, remain) : remain
      wx.chooseMedia({
        count,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType,
        success: (res) => {
          const cur = this.data as ReportComposeData
          const next = res.tempFiles.map((f) => f.tempFilePath)
          const merged = [...cur.images, ...next].slice(0, MAX_IMAGES)
          const mergedD = [...cur.imageDisplays, ...next].slice(0, MAX_IMAGES)
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
      const d = this.data as ReportComposeData
      const images = [...d.images]
      const imageDisplays = [...d.imageDisplays]
      images.splice(idx, 1)
      imageDisplays.splice(idx, 1)
      this.setData({ images, imageDisplays })
      this.syncCanSubmit()
    },

    onNavBack() {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/chronicle/chronicle' })
        },
      })
    },

    async onSubmit() {
      if (!this.data.canSubmit) {
        wx.showToast({ title: '写点内容、选标签或配图', icon: 'none' })
        return
      }
      const d = this.data as ReportComposeData & { editId: string }
      const { text, images, editId, recordDateStr, recordTimeStr, selectedTags } = d
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
        const id = editId
        const result = id
          ? await reportUpdate(id, body, fileIds, tags, recordAtMs)
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
        const self = this as ComposePageThis
        const ch = typeof self.getOpenerEventChannel === 'function' ? self.getOpenerEventChannel() : null
        if (ch && typeof ch.emit === 'function') {
          ch.emit('reportPublished', {
            mode: id ? 'edit' : 'create',
            post,
          })
        }
        wx.showToast({ title: id ? '已保存' : '已发布', icon: 'success', duration: 900 })
        setTimeout(() => {
          wx.navigateBack({
            fail: () => {
              wx.switchTab({ url: '/pages/chronicle/chronicle' })
            },
          })
        }, 320)
      } finally {
        wx.hideLoading()
      }
    },
  },
})
