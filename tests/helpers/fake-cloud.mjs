/**
 * wx-server-sdk 的内存替身，只实现 cloudfunctions/api 用到的那部分接口。
 * 同时记录数据库读次数与签名调用次数，用于断言「一次请求的往返成本」。
 */

const SERVER_DATE = Symbol('serverDate')

class Pred {
  constructor(op, value) {
    this.op = op
    this.value = value
  }
  and(other) {
    return new Pred('and', [this, other])
  }
}

const command = {
  in: (v) => new Pred('in', v),
  eq: (v) => new Pred('eq', v),
  gte: (v) => new Pred('gte', v),
  lte: (v) => new Pred('lte', v),
  inc: (n) => new Pred('inc', n),
  and: (items) => new Pred('and', items),
  or: (items) => new Pred('or', items),
}

const num = (v) => (v instanceof Date ? v.getTime() : v)

function testValue(value, pred) {
  if (!(pred instanceof Pred)) return value === pred
  switch (pred.op) {
    case 'in':
      return pred.value.includes(value)
    case 'eq':
      return pred.value === null ? value == null : value === pred.value
    case 'gte':
      return value != null && num(value) >= num(pred.value)
    case 'lte':
      return value != null && num(value) <= num(pred.value)
    case 'and':
      return pred.value.every((p) => testValue(value, p))
    default:
      throw new Error('unsupported predicate ' + pred.op)
  }
}

function matches(doc, cond) {
  if (cond instanceof Pred) {
    if (cond.op === 'and') return cond.value.every((c) => matches(doc, c))
    if (cond.op === 'or') return cond.value.some((c) => matches(doc, c))
    throw new Error('unsupported top-level predicate ' + cond.op)
  }
  return Object.entries(cond).every(([k, v]) => testValue(doc[k], v))
}

const clone = (v) => structuredClone(v)

function materialize(data, prev = {}) {
  const out = {}
  for (const [k, v] of Object.entries(data)) {
    if (v === SERVER_DATE) out[k] = new Date()
    else if (v instanceof Pred && v.op === 'inc') out[k] = (prev[k] || 0) + v.value
    else out[k] = clone(v)
  }
  return out
}

function notFound() {
  const e = new Error('document does not exist')
  e.errCode = -502003
  return e
}

export function createFakeCloud() {
  const tables = new Map()
  const stats = { reads: 0, signCalls: 0 }
  let seq = 0
  let currentOpenid = ''

  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map())
    return tables.get(name)
  }

  function docRef(name, id) {
    return {
      async get() {
        stats.reads++
        const row = table(name).get(id)
        if (!row) throw notFound()
        return { data: clone(row) }
      },
      async update({ data }) {
        const t = table(name)
        const row = t.get(id)
        if (!row) throw notFound()
        t.set(id, { ...row, ...materialize(data, row) })
        return { stats: { updated: 1 } }
      },
      async set({ data }) {
        table(name).set(id, { ...materialize(data), _id: id })
        return {}
      },
      async remove() {
        table(name).delete(id)
        return { stats: { removed: 1 } }
      },
    }
  }

  function query(name, cond = {}, order = null, limit = 100) {
    const rows = () => [...table(name).values()].filter((r) => matches(r, cond))
    return {
      where: (c) => query(name, c, order, limit),
      orderBy: (field, dir) => query(name, cond, { field, dir }, limit),
      limit: (n) => query(name, cond, order, n),
      async get() {
        stats.reads++
        let list = rows()
        if (order) {
          const sign = order.dir === 'desc' ? -1 : 1
          list = list.sort((a, b) => sign * (num(a[order.field]) - num(b[order.field])))
        }
        return { data: list.slice(0, limit).map(clone) }
      },
      async count() {
        stats.reads++
        return { total: rows().length }
      },
      async update({ data }) {
        const list = rows()
        for (const r of list) table(name).set(r._id, { ...r, ...materialize(data, r) })
        return { stats: { updated: list.length } }
      },
      async remove() {
        const list = rows()
        for (const r of list) table(name).delete(r._id)
        return { stats: { removed: list.length } }
      },
    }
  }

  function collection(name) {
    return {
      ...query(name),
      doc: (id) => docRef(name, id),
      async add({ data }) {
        const _id = `${name}_${++seq}`
        table(name).set(_id, { ...materialize(data), _id })
        return { _id }
      },
    }
  }

  const db = {
    command,
    collection,
    serverDate: () => SERVER_DATE,
    async runTransaction(fn) {
      const snapshot = new Map([...tables].map(([k, v]) => [k, new Map([...v].map(([id, r]) => [id, clone(r)]))]))
      try {
        return await fn({ collection: (name) => ({ doc: (id) => docRef(name, id) }) })
      } catch (e) {
        tables.clear()
        for (const [k, v] of snapshot) tables.set(k, v)
        throw e
      }
    },
  }

  return {
    stats,
    tables,
    /** 直接写入一条文档，模拟历史数据 */
    seed(name, doc) {
      table(name).set(doc._id, clone(doc))
    },
    row: (name, id) => table(name).get(id),
    /** 切换当前调用者，模拟不同微信用户 */
    as(openid) {
      currentOpenid = openid
      return this
    },
    getWXContext: () => ({ OPENID: currentOpenid }),
    database: () => db,
    async getTempFileURL({ fileList }) {
      stats.signCalls++
      return {
        fileList: fileList.map((f) => ({
          fileID: f.fileID,
          tempFileURL: `https://tmp.example/${encodeURIComponent(f.fileID)}?sign=x`,
          status: 0,
          maxAge: f.maxAge,
        })),
      }
    },
  }
}
