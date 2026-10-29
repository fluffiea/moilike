/**
 * 结伴判定（纯函数）。partnerOpenId 为空表示未结伴。
 * already：双方已经互指
 * link：双方都未结伴，可以写成一对
 * repair-me / repair-other：只有一侧写上了，补上另一侧
 * blocked-me / blocked-other：有人已经和别人结伴
 */

function partnerIdOf(doc) {
  if (!doc || typeof doc !== 'object') return ''
  if (typeof doc.partnerOpenId === 'string' && doc.partnerOpenId.trim()) return doc.partnerOpenId.trim()
  if (doc.partner && typeof doc.partner === 'object' && typeof doc.partner.openId === 'string') {
    return doc.partner.openId.trim()
  }
  return ''
}

function decidePair(meId, mePartnerId, otherId, otherPartnerId) {
  const me = typeof meId === 'string' ? meId.trim() : ''
  const other = typeof otherId === 'string' ? otherId.trim() : ''
  const mp = typeof mePartnerId === 'string' ? mePartnerId.trim() : ''
  const op = typeof otherPartnerId === 'string' ? otherPartnerId.trim() : ''
  if (!me || !other || me === other) return 'invalid'
  if (mp === other && op === me) return 'already'
  if (mp && mp !== other) return 'blocked-me'
  if (op && op !== me) return 'blocked-other'
  if (mp === other && !op) return 'repair-other'
  if (!mp && op === me) return 'repair-me'
  if (!mp && !op) return 'link'
  return 'blocked-me'
}

module.exports = {
  partnerIdOf,
  decidePair,
}
