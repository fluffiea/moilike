export type MealSlot = 'breakfast' | 'lunch' | 'dinner'

export function pad2(n: number): string
export function inferSlot(hour: number, minute: number): MealSlot
export function formatDayKey(date: Date): string
export function parseDayKey(key: string): Date
export function shiftDayKey(key: string, delta: number): string
export function formatDateLabel(key: string): string
export function formatHm(ms: number): string
export function recordAtFrom(dayKey: string, hm: string): number
export function inferSlotFromHm(hm: string): MealSlot
