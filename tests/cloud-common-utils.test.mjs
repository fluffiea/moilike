import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const utils = require('../cloudfunctions/_shared/common-utils.js')

test('formatTime 按 UTC+8 输出 MM-DD HH:mm', () => {
  assert.equal(utils.formatTime(new Date('2026-06-04T15:22:44Z')), '06-04 23:22')
  // 跨日：UTC 20:00 已是北京时间次日 04:00
  assert.equal(utils.formatTime(new Date('2026-12-31T20:00:00Z')), '01-01 04:00')
})

test('sanitizeImages 只保留 cloud:// 并尊重上限', () => {
  const input = ['cloud://a', 'https://b', '', 42, 'cloud://c', 'cloud://d']
  assert.deepEqual(utils.sanitizeImages(input, 2), ['cloud://a', 'cloud://c'])
  assert.deepEqual(utils.sanitizeImages(null), [])
})

test('isDocNotFound 识别文档不存在的多种错误形态', () => {
  assert.equal(utils.isDocNotFound({ errCode: -502003 }), true)
  assert.equal(utils.isDocNotFound({ errCode: -502005 }), true)
  assert.equal(utils.isDocNotFound({ errMsg: 'document does not exist' }), true)
  assert.equal(utils.isDocNotFound({ errMsg: 'permission denied' }), false)
  assert.equal(utils.isDocNotFound(null), false)
})

test('partnerOpenIdFromUserRow 兼容平铺与嵌套两种历史写法', () => {
  assert.equal(utils.partnerOpenIdFromUserRow({ partnerOpenId: ' p1 ' }), 'p1')
  assert.equal(utils.partnerOpenIdFromUserRow({ partner: { openId: 'p2' } }), 'p2')
  assert.equal(utils.partnerOpenIdFromUserRow({ partnerOpenId: '   ' }), null)
  assert.equal(utils.partnerOpenIdFromUserRow(null), null)
})

test('coupleAuthorOpenIds 去重且忽略空的伴侣 id', () => {
  assert.deepEqual(utils.coupleAuthorOpenIds('a', 'b'), ['a', 'b'])
  assert.deepEqual(utils.coupleAuthorOpenIds('a', 'a'), ['a'])
  assert.deepEqual(utils.coupleAuthorOpenIds('a', null), ['a'])
})

test('recordTempFileUrlsFromSdk 只收集成功且有临时链接的条目', () => {
  const urls = utils.recordTempFileUrlsFromSdk([
    { fileID: 'cloud://ok', status: 0, tempFileURL: 'https://ok' },
    { fileID: 'cloud://fail', status: -1, tempFileURL: 'https://fail' },
    { fileID: 'cloud://empty', status: 0, tempFileURL: '' },
  ])
  assert.deepEqual(urls, { 'cloud://ok': 'https://ok' })
})

/** 构造一个只够测试 users 读取链的最小集合替身 */
function fakeUsers(rows) {
  const docGet = async (id) => {
    const row = rows[id]
    if (!row) {
      const err = new Error('document does not exist')
      throw err
    }
    return { data: row }
  }
  const where = (query) => {
    const key = Object.keys(query)[0]
    return {
      limit() {
        return this
      },
      async get() {
        const hit = Object.keys(rows)
          .map((id) => rows[id])
          .find((row) => row[key] === query[key])
        return { data: hit ? [hit] : [] }
      },
    }
  }
  return { doc: (id) => ({ get: () => docGet(id) }), where }
}

test('getMutualPartnerOpenId 仅双向绑定才返回对方 id', () => {
  const mutual = fakeUsers({
    a: { partnerOpenId: 'b' },
    b: { partnerOpenId: 'a' },
  })
  const oneWay = fakeUsers({
    a: { partnerOpenId: 'b' },
    b: {},
  })
  return Promise.all([
    utils.getMutualPartnerOpenId(mutual, 'a'),
    utils.getMutualPartnerOpenId(oneWay, 'a'),
    utils.getMutualPartnerOpenId(fakeUsers({ a: { partnerOpenId: 'a' } }), 'a'),
  ]).then(([m, o, self]) => {
    assert.equal(m, 'b')
    assert.equal(o, null)
    assert.equal(self, null)
  })
})
