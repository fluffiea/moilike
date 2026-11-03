/**
 * 点单购物车只活在本次小程序进程里。再来一单会整车替换，不带整单备注。
 */
import { QUICK_TAGS } from './kitchen'

export type CartLine = {
  key: string
  dishId: string
  name: string
  cover: string
  quantity: number
  tags: string[]
}

const MAX_LINES = 30
const MAX_QTY = 99

let kitchenId = ''
let lines: CartLine[] = []
let openRequested = false

function keptTags(tags: string[]): string[] {
  return QUICK_TAGS.filter((t) => tags.includes(t))
}

function keyOf(dishId: string, tags: string[]): string {
  return `${dishId}|${keptTags(tags).join(',')}`
}

export function cartState(): { kitchenId: string; lines: CartLine[] } {
  return {
    kitchenId,
    lines: lines.map((l) => ({ ...l, tags: l.tags.slice() })),
  }
}

export function clearCart(): void {
  kitchenId = ''
  lines = []
}

/** 换了一间厨房就丢掉上一间的车 */
export function useKitchen(nextId: string): void {
  if (kitchenId && kitchenId !== nextId) clearCart()
  kitchenId = nextId
}

export function addLine(input: { kitchenId: string; dishId: string; name: string; cover: string; quantity: number; tags: string[] }): boolean {
  useKitchen(input.kitchenId)
  const tags = keptTags(input.tags)
  const key = keyOf(input.dishId, tags)
  const found = lines.find((l) => l.key === key)
  const quantity = Math.min(MAX_QTY, Math.max(1, input.quantity))
  if (found) {
    found.quantity = Math.min(MAX_QTY, found.quantity + quantity)
    found.name = input.name
    found.cover = input.cover
    return true
  }
  if (lines.length >= MAX_LINES) return false
  lines.push({ key, dishId: input.dishId, name: input.name, cover: input.cover, quantity, tags })
  return true
}

export function setLineQty(key: string, quantity: number): void {
  if (quantity <= 0) {
    lines = lines.filter((l) => l.key !== key)
    if (!lines.length) kitchenId = ''
    return
  }
  const line = lines.find((l) => l.key === key)
  if (line) line.quantity = Math.min(MAX_QTY, quantity)
}

/** 再来一单：只放菜品行，调用方不要把备注塞进来 */
export function replaceCart(nextKitchenId: string, next: Array<Omit<CartLine, 'key'>>): void {
  kitchenId = nextKitchenId
  lines = next.slice(0, MAX_LINES).map((l) => {
    const tags = keptTags(l.tags)
    return {
      key: keyOf(l.dishId, tags),
      dishId: l.dishId,
      name: l.name,
      cover: l.cover,
      quantity: Math.min(MAX_QTY, Math.max(1, l.quantity)),
      tags,
    }
  })
}

export function requestOpenCart(): void {
  openRequested = true
}

export function consumeOpenCart(): boolean {
  const open = openRequested
  openRequested = false
  return open
}
