/**
 * 记账固定分类。id 入库，name 只用于展示。
 * 与 src/core/expense-categories.ts 保持一致；改动时两边一起改。
 *
 * 顺序即展示顺序，高频在前。一级：餐饮、交通、购物、娱乐、居住、学习、医疗、其他。
 * 二级不可自定义。
 */
const CATEGORIES = [
  {
    id: 'food',
    name: '餐饮',
    children: [
      { id: 'takeout', name: '外卖' },
      { id: 'meal', name: '正餐' },
      { id: 'tea', name: '奶茶' },
      { id: 'drink', name: '饮料' },
      { id: 'snack', name: '零食' },
      { id: 'fruit', name: '水果' },
      { id: 'food-other', name: '其他餐饮' },
    ],
  },
  {
    id: 'transit',
    name: '交通',
    children: [
      { id: 'transit-public', name: '公交地铁' },
      { id: 'taxi', name: '打车' },
      { id: 'bike', name: '共享单车' },
      { id: 'fuel-park', name: '加油停车' },
      { id: 'transit-other', name: '其他交通' },
    ],
  },
  {
    id: 'shopping',
    name: '购物',
    children: [
      { id: 'daily', name: '日用' },
      { id: 'clothes', name: '服饰' },
      { id: 'beauty', name: '美妆' },
      { id: 'digital', name: '数码' },
      { id: 'shopping-other', name: '其他购物' },
    ],
  },
  {
    id: 'fun',
    name: '娱乐',
    children: [
      { id: 'social', name: '社交约会' },
      { id: 'media-game', name: '影音游戏' },
      { id: 'outing', name: '出行玩乐' },
      { id: 'fun-other', name: '其他娱乐' },
    ],
  },
  {
    id: 'living',
    name: '居住',
    children: [
      { id: 'rent', name: '房租' },
      { id: 'utility', name: '水电燃气' },
      { id: 'property', name: '物业' },
      { id: 'appliance', name: '家具家电' },
      { id: 'living-other', name: '其他居住' },
    ],
  },
  {
    id: 'study',
    name: '学习',
    children: [
      { id: 'course-book', name: '课程书籍' },
      { id: 'stationery', name: '办公文具' },
      { id: 'study-other', name: '其他学习' },
    ],
  },
  {
    id: 'health',
    name: '医疗',
    children: [
      { id: 'treatment', name: '就医购药' },
      { id: 'healthcare', name: '保健' },
      { id: 'health-other', name: '其他医疗' },
    ],
  },
  {
    id: 'other',
    name: '其他',
    children: [
      { id: 'transfer', name: '转账红包' },
      { id: 'misc', name: '杂项' },
      { id: 'uncategorized', name: '未分类' },
    ],
  },
]

function categoryById(l1) {
  return CATEGORIES.find((c) => c.id === l1) || null
}

/** @returns {{ l1: { id: string, name: string }, l2: { id: string, name: string } } | null} */
function resolveCategory(l1, l2) {
  const parent = categoryById(l1)
  if (!parent) return null
  const child = parent.children.find((c) => c.id === l2)
  if (!child) return null
  return { l1: parent, l2: child }
}

module.exports = { CATEGORIES, categoryById, resolveCategory }
