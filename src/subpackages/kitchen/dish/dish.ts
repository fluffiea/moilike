import { call, callOrToast } from '../../../core/api'
import { askLimitedName, CATEGORY_NAME_MAX } from '../../../core/kitchen'
import { uploadFile } from '../../../core/media'
import { back } from '../../../core/paths'
import { actionSheet, confirm, toast } from '../../../core/ui'

const LEAVE = '内容还没有保存，离开后会丢失。'

type Cat = { id: string; name: string }

Component<
  {
    ready: boolean
    editId: string
    name: string
    desc: string
    onShelf: boolean
    shelfLabel: string
    categoryId: string
    categoryLabel: string
    coverSrc: string
    hasCover: boolean
    categories: Cat[]
    catOpen: boolean
    submitting: boolean
    leaveHint: string
  },
  {},
  WechatMiniprogram.Component.MethodOption,
  { coverFileId: string; coverLocal: string; pendingName: string },
  true
>({
  data: {
    ready: false,
    editId: '',
    name: '',
    desc: '',
    onShelf: true,
    shelfLabel: '上架',
    categoryId: '',
    categoryLabel: '',
    coverSrc: '',
    hasCover: false,
    categories: [],
    catOpen: false,
    submitting: false,
    leaveHint: '',
  },
  methods: {
    async onLoad(q: Record<string, string | undefined>) {
      const editId = q.id || ''
      this.coverFileId = ''
      this.coverLocal = ''
      this.pendingName = ''
      this.setData({ editId })
      const cats = await call('kitchen.categories', {})
      if (!cats.ok) {
        toast(cats.message)
        back()
        return
      }
      const categories = cats.data.categories.map((c) => ({ id: c.id, name: c.name }))
      if (!editId) {
        this.setData({ ready: true, categories })
        return
      }
      const dish = await call('kitchen.dish', { id: editId })
      if (!dish.ok) {
        toast(dish.message)
        back()
        return
      }
      const d = dish.data.dish
      this.coverFileId = d.cover ? d.cover.id : ''
      this.setData({
        ready: true,
        categories,
        name: d.name,
        desc: d.desc,
        onShelf: d.onShelf,
        shelfLabel: d.onShelf ? '上架' : '下架',
        categoryId: d.categoryId,
        categoryLabel: d.categoryName,
        coverSrc: d.cover ? d.cover.url : '',
        hasCover: Boolean(d.cover),
      })
    },
    markDirty() {
      if (this.data.leaveHint) return
      this.setData({ leaveHint: LEAVE })
      if (typeof wx.enableAlertBeforeUnload === 'function') wx.enableAlertBeforeUnload({ message: LEAVE })
    },
    finish() {
      this.setData({ leaveHint: '' })
      if (typeof wx.disableAlertBeforeUnload === 'function') wx.disableAlertBeforeUnload()
    },
    onName(e: WechatMiniprogram.Input) {
      this.setData({ name: e.detail.value })
      this.markDirty()
    },
    onDesc(e: WechatMiniprogram.Input) {
      this.setData({ desc: e.detail.value })
      this.markDirty()
    },
    onToggleShelf(e: { detail: { value: boolean } }) {
      const onShelf = !!e.detail.value
      this.setData({ onShelf, shelfLabel: onShelf ? '上架' : '下架' })
      this.markDirty()
    },
    onOpenCat() {
      this.setData({ catOpen: true })
    },
    onCloseCat() {
      this.setData({ catOpen: false })
    },
    onPickCat(e: WechatMiniprogram.TouchEvent) {
      const id = String(e.currentTarget.dataset.id || '')
      const row = this.data.categories.find((c) => c.id === id)
      if (!row) return
      this.pendingName = ''
      this.setData({ categoryId: row.id, categoryLabel: row.name, catOpen: false })
      this.markDirty()
    },
    async onCreateCat() {
      const name = await askLimitedName({
        title: '新增分类',
        placeholder: '例如心意',
        max: CATEGORY_NAME_MAX,
        empty: '先写分类名',
        tooLong: '分类名最多 8 个字',
      })
      if (!name) return
      this.pendingName = name
      this.setData({ categoryId: '', categoryLabel: name, catOpen: false })
      this.markDirty()
    },
    async onPickCover() {
      const choice = await actionSheet(['拍照', '从相册选择'])
      if (choice < 0) return
      const path = await new Promise<string>((resolve) => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: [choice === 0 ? 'camera' : 'album'],
          success: (r) => resolve(r.tempFiles[0] ? r.tempFiles[0].tempFilePath : ''),
          fail: () => resolve(''),
        })
      })
      if (!path) return
      this.coverLocal = path
      this.coverFileId = ''
      this.setData({ coverSrc: path, hasCover: true })
      this.markDirty()
    },
    onClearCover() {
      this.coverLocal = ''
      this.coverFileId = ''
      this.setData({ coverSrc: '', hasCover: false })
      this.markDirty()
    },
    async onSave() {
      if (this.data.submitting) return
      const name = this.data.name.trim()
      if (!name) {
        toast('先写菜品名称')
        return
      }
      if (!this.data.categoryId && !this.pendingName) {
        toast('请选择或新增分类')
        return
      }
      this.setData({ submitting: true })
      let coverFileId = this.coverFileId
      try {
        if (this.coverLocal) coverFileId = await uploadFile('kitchen', this.coverLocal)
      } catch {
        this.setData({ submitting: false })
        toast('封面上传失败，请重试')
        return
      }
      const payload = {
        name,
        desc: this.data.desc.trim(),
        coverFileId,
        onShelf: this.data.onShelf,
        categoryId: this.pendingName ? '' : this.data.categoryId,
        newCategoryName: this.pendingName,
      }
      const r = this.data.editId
        ? await callOrToast('kitchen.updateDish', { ...payload, id: this.data.editId })
        : await callOrToast('kitchen.createDish', payload)
      this.setData({ submitting: false })
      if (!r) return
      this.finish()
      back()
    },
    async onRemove() {
      if (!this.data.editId || this.data.submitting) return
      const yes = await confirm({
        title: '删除这道菜？',
        content: '已经点过的订单仍会保留当时的名称。',
        confirmText: '删除',
        danger: true,
      })
      if (!yes) return
      const r = await call('kitchen.removeDish', { id: this.data.editId })
      if (!r.ok) {
        toast(r.message)
        return
      }
      this.finish()
      back()
    },
    noop() {},
  },
})
