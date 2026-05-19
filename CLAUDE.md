# Moilike 项目规范

## Language Protocol

- **强制**：所有对话回复必须使用**简体中文**。
- 即使用户输入英文或代码报错为英文，解释和对话仍需使用简体中文。
- 技术术语可保留英文（如 "Closure"、"Hook"、"Middleware"），或附注中文翻译。

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

### 后续扩展

可在此文件末尾追加新小节（如云函数 `callFunction` 命名、`Component` 与页面生命周期混用注意点等），保持每节简短、可执行。
