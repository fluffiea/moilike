# moilike

两人之间的餐食报备。微信小程序 + 云开发。V1 只有两个 Tab：**今日**、**我的**。

旧版（朝夕 / 浮生 / 共鸣 / 独白）打了标签 [`legacy-pre-v1`](https://github.com/fluffiea/moilike/tree/legacy-pre-v1)，不要把这个标签移到 V1 分支上。

## 技术栈

| 层 | 技术 |
|---|------|
| 渲染 | Skyline，glass-easel |
| 前端 | TypeScript（开发者工具编译，`es6: false`） |
| 样式 | WXSS |
| 后端 | 云函数 `user`、`meal`、`migrate`（`wx-server-sdk ~3.0.1`） |
| 数据 | CloudBase 文档数据库 |

云环境使用**新环境**。`miniprogram/constants/env.ts` 里的 `CLOUD_ENV_ID` 留空时，跟随开发者工具当前选中的环境。不要把旧环境 ID 写进去。

## 在微信开发者工具里预览

1. 复制配置并填入**同一个**小程序 AppID：

   ```bash
   cp project.config.example.json project.config.json
   cp project.private.config.example.json project.private.config.json
   ```

2. 用开发者工具打开仓库根目录。云开发里**新建环境**，在工具顶部选中它。若要写死环境，只改 `miniprogram/constants/env.ts` 的 `CLOUD_ENV_ID`。
3. 上传并部署（云端安装依赖）：
   - `cloudfunctions/user`
   - `cloudfunctions/meal`
   - `cloudfunctions/migrate`（只在要迁历史餐食时需要）
4. 数据库新建集合，权限设为**仅云函数可读写**：
   - `users`
   - `meals`
   - 迁移时再加 `legacy_users`、`legacy_reports`
5. 若控制台提示缺索引，按提示为 `meals` 建 `dayKey` + `authorOpenId`，为 `users` 建 `inviteCode`。
6. 编译预览。未登录会停在登录页；登录后是今日账本。结伴入口在「我的」。

V1 没有订阅消息，也没有解绑。

## 页面

| 页面 | 路径 |
|---|---|
| 登录 | `pages/login/login` |
| 今日 | `pages/today/today` |
| 我的 | `pages/mine/mine` |
| 发报备 | `subpackages/meal/compose/compose` |
| 详情 | `subpackages/meal/detail/detail` |
| 结伴 | `subpackages/pair/pair/pair` |

餐次按手机本地时间：5:00–11:00 早餐，11:00–16:00 午餐，其余晚餐。可改。同一餐次可以有多条，账本全部列出。凌晨的晚餐记在你正在看的那一天，不会自动算到前一天。

账本缩略图用报备文字（超过 8 字截断）；没写文字时显示时间。详情里是全文。

对方第一次打开详情才记已读。心意六词：好吃！ / 想尝一口 / 记得按时吃饭 / 辛苦啦 / 看着眼馋 / 抱抱。短句最多 50 字，只保留对方最新一条。

## 结伴迁移

同一 AppID，关系按 openId 对齐。两条路，直接导入优先。

1. **直接导入（推荐）**  
   从旧环境导出 `users`，导入新环境的 `users`。保留 `_id` = openId，保留 `partnerOpenId` 和 `partner`。用户再登录时仍是一对。旧的 8 位 `bindCode` 不再使用，需要新邀请码时会生成 6 位数字。

2. **登录时从 `legacy_users` 认领**  
   若不想整表覆盖 `users`，把旧用户导入 `legacy_users`（`_id` 或 `openId` 为 openId，带 `partnerOpenId`）。用户打开小程序时，`getProfile` 会写成一对。已经和别人结伴的记录不会被覆盖。

批量预热（可选）：给云函数 `user` 配置环境变量 `MIGRATE_KEY`，云端测试：

```json
{ "action": "migrateLegacyPairs", "key": "你的口令", "offset": 0, "limit": 10 }
```

看返回里的 `done`，为 false 时用 `nextOffset` 再调，直到结束。口令不要提交到仓库。

头像若仍是旧环境的 `cloud://` fileID，新环境显示不出来。「我的」里点头像可以重选。V1 没有改昵称的页面。

不迁移 `bind_requests`。V1 不能解绑。

## 历史餐食迁移

只迁旧集合 **`report_posts`**（共鸣报备）。浮生日记不迁。

1. 在**旧环境**把每条报备的 `images` 换成临时 https，按相同顺序写入 `imageTempUrls`。
2. 把这些文档导入新环境集合 `legacy_reports`，保留 `_id`。
3. 给云函数 `migrate` 配置环境变量 `MIGRATE_KEY`，上传部署。
4. 先预览映射，不写库：

   ```json
   { "action": "migrateLegacyMeals", "key": "你的口令", "dryRun": true, "offset": 0, "limit": 3 }
   ```

5. 去掉 `dryRun` 再执行。有临时链接的图片会下载并上传到 `meals/{openId}/legacy-{id}-{i}.jpg`，`meals.images` 只保存新 fileID。  
   返回 `needsMedia` 的是缺链接、没法拷贝的记录，不会写入。无图的旧报备会跳过。`legacyReportId` 用于去重，可以重复跑。

字段对照也在云函数 `migrate` 的 `action: "notes"`（不需要口令），以及 `cloudfunctions/migrate/mapping.js` 文件头。

| 旧字段 | 新字段 |
|---|---|
| `authorOpenId` / 昵称 / 头像 | 同名 |
| `body` | `text`（最多 200 字） |
| `images` + `imageTempUrls` | 新的 `images` fileID |
| `recordAt` | `recordAt`；餐次与 `dayKey` 按北京时间 |
| `partnerReadAt` | `partnerReadAt` |
| `partnerEvalText` | `response.note`（最多 50 字，无贴纸） |
| `partnerEvaluatedAt` | `response.updatedAt` |
| `tags` 及其余共鸣字段 | 丢弃 |

## 实现约定

- 小程序 TypeScript 里不要写 `?.` 和 `??`（当前编译配置会出问题）。
- 纵向 flex 不要用 `gap`，间距写在子元素的 `margin` 上。
- `<input>` 同时给 `height` 和 `line-height`。
- `<text>` 里的中文和插值写在同一行。

本地可跑：

```bash
node cloudfunctions/user/pair-decision.test.js
node cloudfunctions/migrate/mapping.test.js
npx --yes typescript@5.6.3 tsc --noEmit --pretty false
```
