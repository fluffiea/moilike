# 数据库与云存储

所有集合权限均为「仅云函数可读写」，读写只走云函数 `api`。云存储保持默认私有，图片链接由 `api` 在返回数据时批量签名（有效期 2 小时）。

## 集合

### users（文档 `_id` = openid）

| 字段 | 说明 |
|------|------|
| `openId` | 与 `_id` 相同，供绑定码查询后定位对方 |
| `nickName` / `signature` | 资料；`nickName` 非空即视为已注册 |
| `avatarUrl` | 头像云存储 fileID（`avatars/` 下） |
| `partnerOpenId` | 结伴对象 openid；双方在同一事务里互相写入 |
| `togetherSinceMs` | 纪念日（分钟对齐）；双方同值，重新结伴时置空 |
| `bindCode` | 8 位绑定码，首次打开结伴页时生成 |
| `preferences.resonanceReportFilter` | 共鸣默认筛选：`all` / `action_needed` / `mine` |
| `reportTags` | 报备自定义标签（默认标签「干饭」不存储） |
| `partner` | 早期版本的伴侣快照，已不再读取 |

### daily_posts

`authorOpenId`、`snippet`、`images`（fileID 数组，≤9）、`createdAt`、`updatedAt`，以及冗余的评论摘要：

- `commentCount`：评论总数
- `firstComment`：`{ id, authorOpenId, text }`，最早一条评论的前 80 字

早期帖子没有这两个字段，第一次被读取时会自动补算并写回。

### daily_comments

`dailyPostId`、`authorOpenId`、`text`、`parentId`（回复的一级评论 id，一级评论为空串）、`depth`（0 / 1）、`createdAt`。

### report_posts

`authorOpenId`、`body`、`tags`、`images`、`recordAt`（记录时刻，分钟对齐）、`createdAt`、`updatedAt`、`partnerReadAt`、`partnerEvaluatedAt`、`partnerEvalText`。

### letters

`senderId`、`receiverId`（服务端取当前伴侣，不信任客户端）、`title`、`content`、`type`、`images`、`createdAt`、`updatedAt`。

### bind_requests

`fromOpenId`、`toOpenId`、`fromNickName` / `fromAvatarUrl`、`toNickName` / `toAvatarUrl`（申请时快照）、`status`（`pending` / `accepted` / `rejected` / `voided`）、`createdAt`。

## 索引（云开发控制台 → 数据库 → 集合 → 索引管理）

| 集合 | 索引 | 用途 |
|------|------|------|
| `users` | `bindCode` 升序（唯一） | 绑定码查找 |
| `daily_posts` | `authorOpenId` 升序 + `createdAt` 降序 | 浮生列表、按日筛选 |
| `daily_comments` | `dailyPostId` 升序 + `createdAt` 升序 | 详情评论、首评补算 |
| `daily_comments` | `dailyPostId` 升序 + `parentId` 升序 | 判断评论是否有回复 |
| `report_posts` | `authorOpenId` 升序 + `recordAt` 降序 | 共鸣三个筛选 |
| `letters` | `senderId` 升序 + `createdAt` 降序 | 信件列表 |
| `letters` | `receiverId` 升序 + `createdAt` 降序 | 信件列表 |
| `bind_requests` | `toOpenId` 升序 + `status` 升序 | 收到的申请 |
| `bind_requests` | `fromOpenId` 升序 + `status` 升序 | 发出的申请 |

## 云函数配置

- 只有一个云函数 `api`，运行时 Node.js 12 及以上，依赖 `wx-server-sdk ~3.0.1`，部署时选「云端安装依赖」。
- 缩略图使用云存储图片处理（`imageMogr2/thumbnail`），需要按量计费环境。若环境不支持，在云函数「环境变量」中设置 `THUMBNAIL=off`，列表会直接使用原图链接。
- 对首屏敏感可在控制台为 `api` 配置 1 个常驻实例（按量计费环境），进一步消除冷启动。
