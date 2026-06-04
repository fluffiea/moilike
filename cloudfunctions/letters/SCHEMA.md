# letters 集合 — 数据库 Schema

## 集合信息

| 属性 | 值 |
|------|-----|
| 集合名 | `letters` |
| 读写权限 | 仅云函数可读写 |
| 存储引擎 | CloudBase 文档数据库 |

## 文档结构

```json
{
  "_id": "自动生成的文档 ID",
  "_openid": "云开发自动注入的创建者 openId（仅记录，不作为业务字段）",

  "title": "信件标题（字符串，最长 200 字符）",
  "content": "信件正文（字符串，最长 5000 字符）",
  "type": "信件类型（字符串，如 text / confession / apology / thankyou / wish / whisper）",
  "images": ["cloud://...", "cloud://..."],
  "senderId": "发送方 openId（字符串）",
  "receiverId": "接收方 openId（字符串）",

  "createdAt": "创建时间（Date，服务端时间）",
  "updatedAt": "最后更新时间（Date，服务端时间）"
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 否 | 信件标题，最长 200 字符，允许空字符串 |
| `content` | string | 是 | 信件正文，最长 5000 字符，不允许空 |
| `type` | string | 是 | 信件类型：`text`（默认）、`confession`（表白）、`apology`（道歉）、`thankyou`（感谢）、`wish`（许愿）、`whisper`（悄悄话） |
| `images` | string[] | 否 | 配图 cloud:// 文件 ID 列表，最多 9 张 |
| `senderId` | string | 是 | 发送方 openId |
| `receiverId` | string | 是 | 接收方 openId（不能与 senderId 相同） |
| `createdAt` | Date | 自动 | `db.serverDate()` 生成 |
| `updatedAt` | Date | 自动 | `db.serverDate()` 生成，更新时重置 |

## 索引

| 索引字段 | 排序 | 说明 |
|----------|------|------|
| `createdAt` | desc | 按时间倒序展示信件列表 |
| `senderId` + `createdAt` | 1 / desc | 按发送方查询+时间排序 |
| `receiverId` + `createdAt` | 1 / desc | 按接收方查询+时间排序 |

> 推荐在云开发控制台创建组合索引 `senderId-1_createdAt-1` 和 `receiverId-1_createdAt-1`，以及单字段索引 `senderId-1`、`receiverId-1`、`createdAt-1`。

## 访问控制

- **云函数入口**：所有读写通过 `cloudfunctions/letters/index.js` 分发
- **前端禁止直接操作数据库**
- **权限验证规则**：
  - `list`：返回 `senderId === OPENID || receiverId === OPENID` 的交集
  - `get`：仅参与者可查看详情
  - `create`：仅发送方可创建（OPENID 写入 senderId）
  - `delete`：仅发送方可删除（senderId === OPENID）
  - `getMediaTempURLs`：仅参与者可换取配图临时链接

## 对比：同项目其他集合

| 集合名 | 读写权限 | 涉及云函数 |
|--------|----------|-----------|
| `users` | 仅云函数可读写 | user |
| `daily_posts` | 仅云函数可读写 | daily |
| `reports` | 仅云函数可读写 | report |
| `bind_requests` | 仅云函数可读写 | user |
| `report_tags` | 前端可读，云函数可写 | report |
| `letters` | 仅云函数可读写 | letters |
