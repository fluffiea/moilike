const assert = require('assert')
const mapping = require('./mapping')
const rules = require('../../miniprogram/utils/meal-rules')

for (let hour = 0; hour < 24; hour++) {
  for (let minute = 0; minute < 60; minute++) {
    assert.strictEqual(mapping.inferSlot(hour, minute), rules.inferSlot(hour, minute), hour + ':' + minute)
  }
}

assert.strictEqual(mapping.inferSlot(4, 59), 'dinner')
assert.strictEqual(mapping.inferSlot(5, 0), 'breakfast')
assert.strictEqual(mapping.inferSlot(10, 59), 'breakfast')
assert.strictEqual(mapping.inferSlot(11, 0), 'lunch')
assert.strictEqual(mapping.inferSlot(15, 59), 'lunch')
assert.strictEqual(mapping.inferSlot(16, 0), 'dinner')
assert.strictEqual(mapping.inferSlot(0, 0), 'dinner')

const morning = Date.parse('2026-10-29T09:41:00+08:00')
const morningParts = mapping.shanghaiParts(morning)
assert.strictEqual(mapping.dayKeyFromParts(morningParts), '2026-10-29')
assert.strictEqual(mapping.inferSlot(morningParts.h, morningParts.mi), 'breakfast')

const late = Date.parse('2026-10-30T02:10:00+08:00')
const lateParts = mapping.shanghaiParts(late)
assert.strictEqual(mapping.dayKeyFromParts(lateParts), '2026-10-30')
assert.strictEqual(mapping.inferSlot(lateParts.h, lateParts.mi), 'dinner')

const mapped = mapping.mapLegacyReport({
  _id: 'r1',
  authorOpenId: 'oa',
  authorNickName: '小月',
  body: '  简单的午餐  ',
  images: ['cloud://old.env/reports/oa/a.jpg', 'not-a-file', 'cloud://old.env/reports/oa/b.jpg'],
  imageTempUrls: ['https://example.com/a.jpg'],
  recordAt: morning,
  partnerReadAt: morning + 60000,
  partnerEvalText: '好吃呀',
  partnerEvaluatedAt: morning + 120000,
  tags: ['干饭'],
})
assert.strictEqual(mapped.ok, true)
assert.strictEqual(mapped.meal.slot, 'breakfast')
assert.strictEqual(mapped.meal.dayKey, '2026-10-29')
assert.strictEqual(mapped.meal.text, '简单的午餐')
assert.strictEqual(mapped.meal.sources.length, 2)
assert.strictEqual(mapped.meal.sources[0].tempUrl, 'https://example.com/a.jpg')
assert.strictEqual(mapped.meal.sources[1].tempUrl, '')
assert.strictEqual(mapped.meal.response.note, '好吃呀')
assert.strictEqual(mapped.meal.response.sticker, '')

assert.strictEqual(mapping.mapLegacyReport({ _id: 'x', authorOpenId: 'a', recordAt: morning, images: [] }).reason, 'no-image')
assert.strictEqual(mapping.mapLegacyReport({ authorOpenId: 'a', recordAt: morning, images: ['cloud://a'] }).reason, 'no-id')

const longNote = mapping.mapLegacyReport({
  _id: 'n',
  authorOpenId: 'a',
  recordAt: morning,
  images: ['cloud://a/x.jpg'],
  partnerEvalText: '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十多余的字',
})
assert.strictEqual(longNote.meal.response.note.length, 50)

const local = rules.recordAtFrom('2026-10-29', '12:30')
const asDate = new Date(local)
assert.strictEqual(rules.formatHm(local), '12:30')
assert.strictEqual(rules.formatDayKey(asDate), '2026-10-29')
assert.strictEqual(rules.inferSlotFromHm('16:00'), 'dinner')
assert.strictEqual(rules.shiftDayKey('2026-10-29', -1), '2026-10-28')
assert.strictEqual(rules.formatDateLabel('2026-10-29'), '10月29日 周四')

const { STICKERS } = require('../meal/helpers')
const fs = require('fs')
const path = require('path')
const stickerSrc = fs.readFileSync(path.join(__dirname, '../../miniprogram/constants/stickers.ts'), 'utf8')
assert.strictEqual(STICKERS.length, 6)
for (let i = 0; i < STICKERS.length; i++) {
  assert.ok(stickerSrc.indexOf(STICKERS[i]) >= 0, STICKERS[i])
}

console.log('mapping ok')
