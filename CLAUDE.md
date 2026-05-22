# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目架构

情侣间私密互动小程序，基于微信云开发。四大模块：朝夕（纪念日）、浮生（日常记录）、共鸣（报备）、独白（个人资料）。

| 层 | 技术 |
|---|------|
| 渲染引擎 | Skyline（glass-easel 组件框架） |
| 前端语言 | TypeScript（ES2020 + strict，微信开发者工具内置编译，无独立构建管线） |
| 样式 | WXSS + CSS 自定义属性（设计令牌定义在 `app.wxss` 的 `page` 选择器） |
| 后端 | 微信云函数（Node.js，`wx-server-sdk ~3.0.1`） |
| 数据库 | CloudBase 文档数据库 |

- **前端无 `package.json`**：TS 编译由微信开发者工具 `useCompilerPlugins: ["typescript"]` 处理，`es6: false`。
- `cloudfunctions/` 下三个云函数各有自己的 `package.json` 和 `node_modules/`。
- 数据库集合：`users`、`dailies`、`reports`、`bind_requests`、`report_tags`。除 `report_tags` 外均仅云函数可读写。

### 分包与预加载

- 主包 5 个 Tab 页：`login`、`milestones`、`moments`、`resonance`、`profile`
- 3 个分包：`moments_pack`（详情/编辑）、`resonance_pack`（详情/编辑）、`user`（资料编辑/结伴/偏好）
- 每个主 Tab 通过 `preloadRule` 预加载对应分包（`"network": "all"`）

### 云函数模式

所有云函数遵循统一的分发模式：

```
cloudfunctions/<name>/
  index.js      # 入口：按 event.action 分发到 actions/<action>.js
  helpers.js    # 领域内共享逻辑
  actions/      # 每个 action 一个文件，导出一个异步函数
  common/       # 跨云函数公共工具
```

`index.js` 的 `exports.main` 从 `ACTIONS` 表查找 `event.action`，将 `{ event, cloud, db, <集合>, helpers, OPENID }` 传入处理器。每个 action 文件格式：

```js
exports.main = async ({ event, cloud, db, dailyCol, usersCol, helpers, OPENID }) => {
  // ...
  return { ok: true, data: { ... } }
}
```

### 前端模块组织

```
miniprogram/utils/
  api/          # 云函数调用封装（daily-api.ts, report-api.ts）
  display/      # 展示数据转换（Feed 显示逻辑）
  upload/       # 图片上传逻辑
miniprogram/constants/   # limits.ts, paths.ts, resonance-preferences.ts
miniprogram/types/       # cloud.ts, cloud-daily.ts, cloud-report.ts, cloud-user.ts, user.ts
miniprogram/behaviors/   # require-auth.ts — 鉴权 Behavior，挂载到需登录的页面/组件
```

---

## 设计令牌

全局 CSS 变量定义在 `miniprogram/app.wxss` 的 `page` 选择器：

- `--mo-l0-bg` / `--mo-l1-card` — 背景色层级
- `--mo-text-primary` / `--mo-text-secondary` / `--mo-text-tertiary` — 文字层级
- `--mo-brand-teal` (#668f80) / `--mo-brand-slate` (#4a6670) — 品牌色
- `--mo-gradient-brand` — 品牌渐变

使用变量而非硬编码颜色值。

---

## 命名规范

- **禁止使用拼音**作为标识符、目录名、文件名、分包名、路由路径、TabBar 图标名、Storage key、云字段名。
- 使用**有意义的英文**（如 `moments`、`resonance`、`reportFilter`），遵循项目现有命名习惯。
- **例外**：面向用户的 UI 文案（WXML 中文、`navigationBarTitleText` 等）可使用中文。
- 持久化键名：若已有非拼音旧字段需兼容，新写入统一用英文键。

## Git 提交规范

- **禁止在 commit message 中添加 `Co-Authored-By`、`Signed-off-by`、`Reviewed-by` 等 trailer**，除非用户明确要求。
- commit message 只包含用户指定的内容，不附加任何元数据标记。
- 提交前需得到用户明确许可，不可主动 commit。

## 代码行为准则

### 1. 先想后写

实现之前：
- 明确陈述假设。不确定就提问确认。
- 如果存在多种解读，列出来再决策。
- 如有更简单方案，明确提出。
- 有疑问就停下来说清楚。

### 2. 极简优先

- 只写满足需求的最少代码，不写未被请求的功能。
- 不写只调用一次的抽象层。
- 不写未被请求的"灵活性"或"可配置性"。
- 不处理不可能发生的错误。
- 尽量用编辑现有文件而非创建新文件。

### 3. 精准修改

- 只改被请求的部分，不动相邻代码、注释或格式。
- 不改没坏的东西。
- 匹配现有代码风格。
- 发现无关的死代码，口头提醒即可，不要删除。
- 只清理**你的改动**造成的孤立引用。

### 4. 目标驱动

- 将任务转化为可验证目标。
- 多步骤任务先列计划再执行。

## 小程序脚本与表现层约定

适用范围：`miniprogram/` 下由微信开发者工具编译的 TypeScript 脚本（`useCompilerPlugins: ["typescript"]`）及同目录 WXML（Skyline 页面/组件）。

### TS 语法兼容

工具链对**可选链 `?.`** 支持不完整，可能导致单文件编译失败，进而不生成对应的 `.js`，表现为子包/页面在 `app.json` 中报错「找不到 `xxx.js`」。

- **在 `miniprogram/**/*.ts` 中避免使用可选链 `?.`**，改用显式判空（`obj && obj.prop`、三元、`if` 收窄等）。
- **避免空值合并 `??`**：在 `"es6": false` 配置下，上传/真机校验可能报 `Unexpected token ?`。改用 `a != null ? a : b` 等显式写法。

```typescript
// ❌ 易触发工具链编译失败
const id = typeof options?.id === 'string' ? options.id.trim() : ''

// ✅ 显式判断
const id = options && typeof options.id === 'string' ? options.id.trim() : ''
```

### Skyline / WXML：中文旁禁用多行 `<text>` + 缩进空白 + 插值

Skyline 下 `<text>` 标签内换行+大量前导空格+`{{ }}` 插值与中文混排，部分真机会出现豆腐块。

- **`<text>` 内文案与插值写在同一行**，不要在正文前保留与 WXML 缩进对齐的空格。
- **「共 {{n}} 条」**类整句，优先在 TS 里拼好字符串，WXML 只绑定一个变量。

### Skyline / WXSS：flex 与 input 兼容注意

Skyline 对以下 CSS 模式支持不完整，真机表现与模拟器不符：

- **`gap` 在列 flex 容器上不可靠**：`display: flex; flex-direction: column; gap: 24rpx` 可能导致子元素间距消失。改用在每个子元素上写 `margin-bottom`。
- **`<input>` 需要显式 `height`**：仅靠 `padding` 无法给 `<input>` 正确高度，会塌陷成一条线。须同时设 `height` 和 `line-height`（`line-height` = `height` - 上下 padding）。
- **`margin-left: auto` 在 `flex-wrap: wrap` 中折行异常**：若行内元素折行，带 `margin-left: auto` 的元素跳到新行并靠右，破坏布局。改用在左侧兄弟元素设 `flex: 1` 推挤右侧元素。
