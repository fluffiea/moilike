# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目架构

情侣间私密互动小程序，基于微信云开发。四大模块：朝夕（纪念日 + 信件）、浮生（日常记录）、共鸣（报备）、独白（个人资料）。

| 层 | 技术 |
|---|------|
| 渲染引擎 | Skyline（glass-easel 组件框架） |
| 前端语言 | TypeScript（strict），`scripts/build.mjs` 用 esbuild 把 `src/` 逐文件编译为 ES2017 CommonJS 到 `miniprogram/` |
| 样式 | WXSS + CSS 自定义属性（设计令牌定义在 `src/app.wxss` 的 `page` 选择器） |
| 后端 | 单一云函数 `cloudfunctions/api`（Node.js，`wx-server-sdk ~3.0.1`） |
| 数据库 | CloudBase 文档数据库，集合与索引见 `docs/DATABASE.md`，全部仅云函数可读写 |

- **源码只改 `src/`**：`miniprogram/` 是编译产物（已 gitignore），开发时 `npm run dev` 监听编译，开发者工具不再编译 TS（`useCompilerPlugins: false`）。
- 提交前跑 `npm run check`：类型检查 + `cloudfunctions/api` 端到端测试 + Skyline 规则自检 + 构建。
- 云存储保持私有：图片与头像链接由云函数在同一次响应里批量签名（含缩略图参数），前端不单独换链。

### 分包与预加载

- 主包：Tab 页 `milestones`（首页）、`moments`、`resonance`、`profile`，以及 `login`
- 4 个分包：`moments_pack`（详情/编辑）、`resonance_pack`（详情/编辑）、`user`（资料编辑/结伴/偏好）、`letters_pack`（信件列表/写信/详情）
- 已登录用户直接进朝夕，用本地缓存渲染；只有无缓存或服务端判定未注册时才去 `login`

### 云函数

```
cloudfunctions/api/
  index.js      # 入口：event.route = '<域>.<动作>'，返回 { ok, data } 或 { ok: false, code, message }
  lib/          # context（本次请求的本人/伴侣文档，按需读取并复用）、media（签名）、paging（游标分页）、util、profile
  routes/       # home / user / daily / report / letters，每个导出的函数就是一个路由
```

路由函数签名为 `async (ctx, event) => data`，业务错误用 `fail(code, message)` 抛出。只有路由函数可以从 `routes/*.js` 导出（导出即对外可调用）。

### 前端模块组织

```
src/core/
  api.ts        # call(route, data)：唯一的云函数调用入口，类型来自 types/api.ts 的 Routes
  store.ts      # 当前用户（内存为准、Storage 只做冷启动恢复）、跨页事件 on/emit、页面交接 handoff、列表缓存
  feed.ts       # 列表控制器：缓存先渲染再刷新、游标分页按路径追加 setData、增删改
  views.ts      # 接口数据 → 展示数据（中文整句在这里拼好）
  compose.ts    # 发布页 Behavior：配图、提交状态、未保存离开提醒
  format.ts / media.ts / ui.ts / paths.ts
src/components/ # app-nav、state-view、daily-card、report-card、image-grid、image-picker、together-clock
```

- 页面间传数据用 `store` 的事件和 `handoff`，不要用 EventChannel 或 Storage 暂存。
- `data` 只放模板用到的字段；原始数据放实例属性。列表翻页用 `items[n]` 路径更新，不要整表 setData。

---

## 设计令牌

全局 CSS 变量定义在 `src/app.wxss` 的 `page` 选择器（组件内同样可用）：

- `--mo-l0-bg` / `--mo-l1-card` / `--mo-l1-accent` / `--mo-skeleton` — 背景层级
- `--mo-text-primary|secondary|muted|inverse|danger` — 文字
- `--mo-brand-teal` / `--mo-brand-slate` / `--mo-brand-rose` / `--mo-brand-sand` — 品牌色
- `--mo-status-pending|read|evaluated`（各带 `-text` 深色变体）— 报备状态
- `--mo-gradient-brand` / `--mo-gradient-warm` — 品牌渐变
- `--mo-shadow-card` / `--mo-border-card|field` / `--mo-radius-card|inner|btn|chip` / `--mo-pad-h` / `--mo-safe-bottom`

页面可直接用 `app.wxss` 里的 `.mo-*` 公共类（卡片、按钮、底栏、悬浮按钮、输入框、标签）。使用变量而非硬编码颜色；`npm run check` 会校验 `var(--mo-*)` 都已定义。

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

适用范围：`src/` 下的 TypeScript 与 WXML（Skyline 页面/组件）。

### TS 语法

esbuild 会把 `?.`、`??`、对象展开等降级为 ES2017，源码中可以正常使用。云函数（`cloudfunctions/api`）不经编译，需兼容 Node.js 12：不要用 `?.`、`??`、`Object.hasOwn`。

### Skyline / WXML：中文旁禁用多行 `<text>` + 缩进空白 + 插值

Skyline 下 `<text>` 标签内换行+大量前导空格+`{{ }}` 插值与中文混排，部分真机会出现豆腐块。

- **`<text>` 内文案与插值写在同一行**，不要在正文前保留与 WXML 缩进对齐的空格。
- **「共 {{n}} 条」**类整句，优先在 TS 里拼好字符串，WXML 只绑定一个变量。

## 📝 Git 工作流

### 分支规则（重要）
- **`main` 分支受保护**：禁止直接提交任何代码到 `main`
- **`dev` 分支**：所有代码开发和提交只能在 `dev` 分支上进行
- **合并审批**：`dev` → `main` 的合并需要项目负责人审批后才能操作

### 日常操作
```bash
# 确保在 dev 分支
git checkout dev

# 写代码、提交
git add .
git commit -m "feat: xxx"

# 推送到远程 dev
git push origin dev

# 合并到 main（需要负责人审批后执行）
git checkout main
git merge dev
git push origin main
git checkout dev  # 切回 dev 继续开发
```

### Skyline / WXSS：flex 与 input 兼容注意

Skyline 对以下 CSS 模式支持不完整，真机表现与模拟器不符：

- **`gap` 在列 flex 容器上不可靠**：`display: flex; flex-direction: column; gap: 24rpx` 可能导致子元素间距消失。改用在每个子元素上写 `margin-bottom`。
- **`<input>` 需要显式 `height`**：仅靠 `padding` 无法给 `<input>` 正确高度，会塌陷成一条线。须同时设 `height` 和 `line-height`（`line-height` = `height` - 上下 padding）。
- **`margin-left: auto` 在 `flex-wrap: wrap` 中折行异常**：若行内元素折行，带 `margin-left: auto` 的元素跳到新行并靠右，破坏布局。改用在左侧兄弟元素设 `flex: 1` 推挤右侧元素。
