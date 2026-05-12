# Moilike 项目重构计划

## 项目总览

小程序 "Moilike" 是一个情侣间私密互动工具，基于微信云开发。包含 4 个主 Tab 页面和 3 个云函数模块，约 25 个前端文件 + 3 个巨型云函数。

### 模块划分

| 模块 | 涉及文件 | 当前状态 |
|------|---------|---------|
| **A. 基础设施层** | session, auth-guard, cloud-invoke, paths, types, avatar-display | 基本可用，但类型定义散乱 |
| **B. 用户/认证** | login, profile, edit-profile, partner-hub, preferences, user 云函数 | 功能完整，代码质量一般 |
| **C. 日常(浮生)** | moments, daily-compose, daily-detail, daily-api, daily 云函数 | 功能完整，但数据流复杂 |
| **D. 报备(共鸣)** | resonance, report-compose, report-detail, report-api, report 云函数 | 功能完整，代码重复多 |
| **E. 朝夕(纪念日)** | milestones, together-since, togetherSinceMs | 相对干净，轻微问题 |

### 核心问题诊断

1. **云函数巨石模式**: 3 个云函数文件各 650-936 行，内部 switch(event.action) 路由
2. **云函数大量重复代码**: `getUserDocRow`、`getMutualPartnerOpenId`、`formatTime` 等在 3 个云函数中完全重复
3. **僵尸文件**: 4 个 .js 文件与 .ts 文件并存未清理
4. **类型定义扁平化**: 所有云函数返回类型塞在 types/cloud.ts 一个文件
5. **前端工具函数组织混乱**: utils/ 下 17 个文件，API 封装、展示逻辑、上传逻辑混杂
6. **数据流过度复杂**: moments/daily-compose/daily-detail 之间通过 EventChannel + Storage 双重通信

---

## 重构步骤（建议顺序执行）

### 阶段一：清理与基础设施（低风险，打基础）

**1.1 删除僵尸 JS 文件**
- 删除 `pages/moments/moments.js`
- 删除 `pages/resonance/resonance.js`
- 删除 `subpackages/resonance/report-compose/report-compose.js`
- 删除 `subpackages/resonance/report-detail/report-detail.js`
- 工时: 5 分钟，风险: 无

**1.2 提取共享云函数工具模块**
- 在 `cloudfunctions/common/` 下创建 `utils.js`，抽离:
  - `getUserDocRow`、`getMutualPartnerOpenId`、`coupleAuthorOpenIds`
  - `isDocNotFound`、`formatTime`
  - `sanitizeImages`、`nickAvatarForAuthor`
  - `partnerOpenIdFromUserRow`
- 3 个云函数改为 `require('../common/utils')`
- 工时: 2-3 小时，风险: 中（需逐个验证每个 action 行为不变）

**1.3 重构类型定义文件**
- 拆分 `types/cloud.ts` → `types/cloud-daily.ts`、`types/cloud-report.ts`、`types/cloud-user.ts`
- 保留 `types/cloud.ts` 仅做 re-export 向后兼容
- 工时: 1 小时，风险: 低

**1.4 提取共享常量**
- 创建 `miniprogram/constants/limits.ts`，集中管理 MAX_IMAGES、PAGE_SIZE、MAX_SNIPPET 等
- 同步更新客户端和云函数中的魔法数字
- 工时: 1 小时，风险: 低

### 阶段二：云函数重构（高风险，核心痛点）

**2.1 拆分 daily 云函数** ✅
- 从 889 行单体拆为每个 action 一个文件:
  - `daily/createDaily.js`、`daily/updateDaily.js`、`daily/deleteDaily.js`
  - `daily/listDaily.js`、`daily/getDaily.js`、`daily/getDailyFeedItem.js`
  - `daily/listDailyComments.js`、`daily/addDailyComment.js`、`daily/updateDailyComment.js`、`daily/deleteDailyComment.js`
  - `daily/getDailyMediaTempURLs.js`
- 入口保留 `daily/index.js` 做分发
- 工时: 4-5 小时，风险: 高（需确保每个 action 行为不变）

**2.2 拆分 report 云函数** ✅
- 同样拆为每个 action 一个文件
- 工时: 3-4 小时，风险: 高

**2.3 拆分 user 云函数** ✅
- 同样拆为每个 action 一个文件
- 工时: 4-5 小时，风险: 高

### 阶段三：前端代码结构优化（中风险）

**3.1 重组 utils/ 目录** ✅
- `utils/api/` —— daily-api.ts、report-api.ts
- `utils/display/` —— daily-feed-display.ts、report-feed-display.ts、avatar-display.ts
- `utils/upload/` —— daily-upload.ts、report-upload.ts
- `utils/session.ts` 保持在 utils/ 根目录
- 工时: 2 小时，风险: 中（import 路径全局变更）

**3.2 统一错误处理模式** ✅
- `formatDailyCloudBizError` 重命名为 `formatCloudBizError`（日常/报备通用）
- 工时: 1 小时，风险: 低

**3.3 清理 moments 页面的 js 残留和代码风格** ✅
- 使用 `Component<MomentsPageData, {}, MomentsMethods, MomentsCustomInstanceProperty>` 泛型替代 `as MomentsPageData`
- 用 `MomentsCustomInstanceProperty` 类型化实例属性替代 `ext[MAGIC_KEY]` 模式
- 工时: 1 小时，风险: 中

### 阶段四：业务逻辑优化（中低风险）

**4.1 简化浮生(moments)数据流** ✅
- 移除了 daily-compose 中接收 `composeInit` 的 EventChannel 监听，Storage (`takeDailyEditStaging`) 作为唯一数据路径
- 工清理了 `moments.ts` 中 `openDailyComposeEdit` 的 `success` 回调（不再 emit `composeInit`）
- 工时: 1 小时，风险: 中

**4.2 简化共鸣(resonance)数据流** ✅
- 移除了 report-compose 中接收 `reportComposeInit` 的 EventChannel 监听
- 移除了 `resonance.ts` 中 `openReportComposeEdit` 的 `success` 回调
- 工时: 0.5 小时，风险: 中

**4.3 统一 Component 模式** ✅
- 6 个文件全部改为 `Component<Data, {}, Methods, CustomInstanceProperty>` 泛型模式
- 移除所有 `as WechatMiniprogram.IAnyObject` / `ext[MAGIC_KEY]` 类型断言
- 文件: moments.ts, resonance.ts, milestones.ts, daily-compose.ts, report-compose.ts, daily-detail.ts
- 工时: 2 小时，风险: 低

### 阶段五：代码质量收尾

**5.1 全局样式整理** ✅
- `app.wxss` 新增 CSS 自定义属性（设计令牌）：颜色、阴影、边框、圆角、间距
- 添加全局 `page` 选择器（`height: 100vh; background-color: var(--mo-l0-bg)`）
- 移除 10 个页面 wxss 中重复的 `page { height: 100vh; background-color: #f2f2f7; }` 声明
- daily-detail.wxss 保留 `page { font-family: ... }` 覆盖
- 保留 login.wxss (`#f4f0ea`) 和 extra/index.wxss (`#fafafa`) 的独特页面背景
- 工时: 1 小时，风险: 低

**5.2 最终验证**
- 全流程回归测试：
  - 登录 → 编辑资料 → 设置偏好
  - 对象绑定 → 设置纪念日
  - 发布日常 → 查看详情 → 添加评论 → 编辑/删除评论
  - 发布报备 → 切换筛选 → 标记已阅 → 评价
- 工时: 2-3 小时

---

## 优先级建议

| 优先级 | 步骤 | 理由 |
|--------|------|------|
| P0 | 1.1 删除僵尸文件 | 零风险，立即减少混淆 |
| P0 | 1.2 提取共享云函数工具 | 消除最大重复代码源 |
| P1 | 1.3 + 1.4 类型和常量整理 | 为后续重构打基础 |
| P1 | 2.1-2.3 拆分云函数 | 核心痛点，文件可维护性质变 |
| P2 | 3.1 重组 utils | 为后续新功能开发铺路 |
| P2 | 3.2 统一错误处理 | 减少重复模式 |
| P3 | 3.3 + 4.1-4.3 业务逻辑优化 | 锦上添花，非阻塞 |
| P4 | 5.1 样式整理 | 低优先级 |
| P4 | 5.2 回归测试 | 每个阶段完成后都应执行 |

---

## 风险提示

- **阶段二（云函数拆分）风险最高**：云函数无本地测试环境，每次修改需部署验证。建议「改一个 action → 部署 → 验证 → 下一个」的节奏，避免一次性大面积改动导致定位困难。
- **不能只靠 TypeScript 编译通过**来判断重构正确性——云函数是 JS，需实际触发每个 action 来验证。
- **微信云开发没有 staging 环境**，建议在非高峰时段操作，或使用单独的云环境。
