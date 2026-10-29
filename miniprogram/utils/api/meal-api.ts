import type { MealPublic, MealSlot } from '../../types/meal'
import { callFn } from './call'

const NAME = 'meal'

export type MealResult = { ok: true; meal: MealPublic } | { ok: false; error?: string }
export type DayResult =
  | { ok: true; dayKey: string; paired: boolean; meals: MealPublic[] }
  | { ok: false; error?: string }

export async function listDay(dayKey: string): Promise<DayResult> {
  return callFn<DayResult>(NAME, { action: 'listDay', dayKey: dayKey })
}

export async function createMeal(input: {
  images: string[]
  text: string
  slot: MealSlot
  dayKey: string
  recordAtMs: number
}): Promise<MealResult> {
  return callFn<MealResult>(NAME, {
    action: 'createMeal',
    images: input.images,
    text: input.text,
    slot: input.slot,
    dayKey: input.dayKey,
    recordAtMs: input.recordAtMs,
  })
}

export async function getMeal(id: string): Promise<MealResult> {
  return callFn<MealResult>(NAME, { action: 'getMeal', id: id })
}

export async function respondMeal(id: string, sticker: string, note: string): Promise<MealResult> {
  return callFn<MealResult>(NAME, { action: 'respondMeal', id: id, sticker: sticker, note: note })
}
