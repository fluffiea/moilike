/**
 * 记账固定分类。id 入库，name 只用于展示。
 * 与 cloudfunctions/api/lib/categories.js 保持一致；改动时两边一起改。
 * 数组顺序即界面顺序，高频在前。
 */
export type ExpenseCategory = {
  id: string
  name: string
  children: { id: string; name: string }[]
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
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

export function categoryById(id: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)
}
