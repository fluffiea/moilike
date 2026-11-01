/**
 * 记账固定分类。id 入库，name 只用于展示。
 * 与 cloudfunctions/api/lib/categories.js 保持一致；改动时两边一起改。
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
      { id: 'snack', name: '零食' },
    ],
  },
  {
    id: 'transit',
    name: '交通',
    children: [
      { id: 'metro', name: '地铁' },
      { id: 'bus', name: '公交' },
      { id: 'taxi', name: '打车' },
      { id: 'rail', name: '火车' },
      { id: 'bike', name: '单车' },
    ],
  },
  {
    id: 'shopping',
    name: '购物',
    children: [
      { id: 'market', name: '超市' },
      { id: 'daily', name: '日用' },
      { id: 'clothes', name: '服饰' },
      { id: 'digital', name: '数码' },
    ],
  },
  {
    id: 'living',
    name: '居住',
    children: [
      { id: 'rent', name: '房租' },
      { id: 'utility', name: '水电' },
      { id: 'property', name: '物业' },
      { id: 'furnish', name: '家居' },
    ],
  },
  {
    id: 'fun',
    name: '娱乐',
    children: [
      { id: 'movie', name: '电影' },
      { id: 'game', name: '游戏' },
      { id: 'travel', name: '旅行' },
      { id: 'sport', name: '运动' },
    ],
  },
  {
    id: 'health',
    name: '医疗',
    children: [
      { id: 'drug', name: '药品' },
      { id: 'clinic', name: '门诊' },
    ],
  },
  {
    id: 'study',
    name: '学习',
    children: [
      { id: 'book', name: '书籍' },
      { id: 'course', name: '课程' },
    ],
  },
  {
    id: 'other',
    name: '其他',
    children: [{ id: 'misc', name: '其他' }],
  },
]

export function categoryById(id: string): ExpenseCategory | undefined {
  return EXPENSE_CATEGORIES.find((c) => c.id === id)
}
