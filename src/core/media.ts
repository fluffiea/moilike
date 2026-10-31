import { getUser } from './store'
import { actionSheet } from './ui'

/** 编辑中的一张图：已上传的带 fileId，新选的只有本地路径 */
export type PickedImage = { fileId: string; src: string }

export async function pickImages(remain: number): Promise<string[]> {
  if (remain <= 0) return []
  const choice = await actionSheet(['从相册选择', '拍照'])
  if (choice < 0) return []
  return new Promise((resolve) => {
    wx.chooseMedia({
      count: choice === 1 ? 1 : remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: [choice === 1 ? 'camera' : 'album'],
      success: (r) => resolve(r.tempFiles.map((f) => f.tempFilePath).slice(0, remain)),
      fail: () => resolve([]),
    })
  })
}

function randomName(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.jpg`
}

export async function uploadFile(dir: string, filePath: string): Promise<string> {
  const u = getUser()
  const owner = u ? u.openId : 'anonymous'
  const r = await wx.cloud.uploadFile({ cloudPath: `${dir}/${owner}/${randomName()}`, filePath })
  if (!r.fileID) throw new Error('上传失败')
  return r.fileID
}

/** 并行上传尚未上传的图片，按原顺序返回 fileID */
export function uploadImages(dir: string, images: PickedImage[]): Promise<string[]> {
  return Promise.all(images.map((img) => (img.fileId ? img.fileId : uploadFile(dir, img.src))))
}

export function previewImages(urls: string[], index: number): void {
  const list = urls.filter(Boolean)
  if (list.length === 0) return
  wx.previewImage({ urls: list, current: urls[index] || list[0] })
}
