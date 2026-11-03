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
| `preferences.resonanceReportFilter` | 共鸣默认筛选：`all` / `await_me` / `mine`。缺省 `await_me`。库里的旧值 `action_needed` 读出时当作 `await_me`，已保存的 `all` / `mine` 不改写 |
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

`authorOpenId`、`body`、`tags`、`images`、`recordAt`（记录时刻，分钟对齐）、`createdAt`、`updatedAt`。

对方的轻互动：

| 字段 | 说明 |
|------|------|
| `partnerOpenedAt` | 对方打开详情的时间；空表示还没打开。旧数据没有该字段时，接口用 `partnerReadAt` 顶上 |
| `partnerStickerId` | 对方最新一张贴纸：`care` 收到啦、`seen` 看见了、`eat` 记得吃饭、`miss` 想你、`ok` 好的、`hug` 抱抱、`proud` 辛苦了、`love` 爱你。空表示还没回心 |
| `partnerRespondedAt` | 最近一次贴贴纸的时间。再贴会覆盖贴纸和这个时间 |
| `partnerReadAt` | 旧「标记已阅」。新数据在打开或回心时顺手写上，用来和旧字段对齐；界面不再单独展示已阅 |
| `partnerEvaluatedAt` / `partnerEvalText` | 旧文字评价。本期不再写入、也不再下发评价正文。已经有 `partnerEvaluatedAt` 的帖子视为已回应，不进「待我回应」 |

状态只有两个：没有贴纸、也没有旧评价 → `awaiting_response`；否则 `responded`。只打开详情不单独成一种状态。

列表筛选 `all` / `await_me` / `mine`。`await_me` 是对方发出、且 `partnerStickerId` 与 `partnerEvaluatedAt` 都为空的帖子。`report.list` 同时返回 `awaitMeCount`（待我回应的条数，跟当前这一页无关）。`report.open` 在进详情时写下打开时间，已打开则不改。`report.respond({ id, stickerId })` 覆盖贴纸。作者 `report.update` 只改正文、图片、标签和记录时间，不清贴纸。`report.markRead` 与 `report.evaluate` 已移除。

### letters

`senderId`、`receiverId`（服务端取当前伴侣，不信任客户端）、`title`、`content`、`type`、`images`、`createdAt`、`updatedAt`。寄出后改过的信有 `edited: true`。

### expenses

每人一本支出账，不依赖结伴。查询一律带 `authorOpenId = 当前 openId`，伴侣也读不到。

| 字段 | 说明 |
|------|------|
| `authorOpenId` | 记账人；只由云函数写入 |
| `amountFen` | 金额，正整数，单位分 |
| `l1` / `l2` | 固定分类 id，见下表；不可自定义 |
| `note` | 备注，可空，最多 50 字 |
| `occurredAt` | 发生时间，分钟对齐 |
| `createdAt` / `updatedAt` | 写入时间 |

自然月、环比和「本月未结束」都按北京时间切分。完整月均只统计已经结束的自然月（有支出的月份做平均），不含当前这个还没过完的月。

分类 id 与展示名（前后端各有一份，必须一致）：

| 一级 | id | 二级 |
|------|----|------|
| 餐饮 | `food` | 外卖 `takeout`、正餐 `meal`、奶茶 `tea`、饮料 `drink`、零食 `snack`、水果 `fruit`、其他餐饮 `food-other` |
| 交通 | `transit` | 公交地铁 `transit-public`、打车 `taxi`、共享单车 `bike`、加油停车 `fuel-park`、其他交通 `transit-other` |
| 购物 | `shopping` | 日用 `daily`、服饰 `clothes`、美妆 `beauty`、数码 `digital`、其他购物 `shopping-other` |
| 娱乐 | `fun` | 社交约会 `social`、影音游戏 `media-game`、出行玩乐 `outing`、其他娱乐 `fun-other` |
| 居住 | `living` | 房租 `rent`、水电燃气 `utility`、物业 `property`、家具家电 `appliance`、其他居住 `living-other` |
| 学习 | `study` | 课程书籍 `course-book`、办公文具 `stationery`、其他学习 `study-other` |
| 医疗 | `health` | 就医购药 `treatment`、保健 `healthcare`、其他医疗 `health-other` |
| 其他 | `other` | 转账红包 `transfer`、杂项 `misc`、未分类 `uncategorized` |

### kitchens

每人最多一间。`ownerOpenId`（创建者，也是接单方）、`name`、`createdAt`、`updatedAt`。创建时不写入任何分类或菜品，没有系统预置的「心意 / 陪伴 / 日常」。

### kitchen_categories

`kitchenId`、`ownerOpenId`、`name`（最多 8 字）、`createdAt`、`updatedAt`。同一厨房内名称不可重复。只有名下没有菜品时才能删除。列表按 `createdAt` 升序，不做拖拽排序。

### kitchen_dishes

`kitchenId`、`ownerOpenId`、`categoryId`、`name`（最多 16 字）、`desc`（最多 40 字，可空）、`coverFileId`（云存储 fileID，可空）、`onShelf`、`createdAt`、`updatedAt`。必须挂在该厨房的某个分类下；新建菜品时可以同时带一个新分类名。封面只接受 `cloud://`。

### kitchen_orders

下单方是伴侣，接单方是厨房主人。客户端不能指定厨房。

| 字段 | 说明 |
|------|------|
| `kitchenId` / `ownerOpenId` / `ordererOpenId` | 厨房、接单方、下单方 |
| `status` | `pending` 待接单 → `in_progress` 进行中 → `done` 已完成；下单方在 `pending` 可改为 `cancelled`。没有拒单 |
| `note` | 整单备注，最多 80 字，可空。再来一单不读取这个字段 |
| `items` | `{ dishId, name, quantity, tags }[]`。名称是下单时的快照。`quantity` 为 1–99。`tags` 只允许「今天就要」「周末」「想你了」，最多 3 个 |
| `createdAt` / `updatedAt` | 写入时间 |
| `acceptedAt` / `completedAt` / `cancelledAt` | 对应动作的时间，未发生为 null |

点单页的「常点 / 我们点过 N 次」只统计 `status = done` 的订单：同一单里同一道菜只计 1 次，不管份数。没有完成记录时不返回文案。满 5 次显示「常点」，否则「我们点过 N 次」。待接单数只计 `ownerOpenId + pending`，展示在独白「我的厨房」入口，不打在点单 Tab 上。

### bind_requests

`fromOpenId`、`toOpenId`、`fromNickName` / `fromAvatarUrl`、`toNickName` / `toAvatarUrl`（申请时快照）、`status`（`pending` / `accepted` / `rejected` / `voided`）、`createdAt`。

## 索引（云开发控制台 → 数据库 → 集合 → 索引管理）

| 集合 | 索引 | 用途 |
|------|------|------|
| `users` | `bindCode` 升序（唯一） | 绑定码查找 |
| `daily_posts` | `authorOpenId` 升序 + `createdAt` 降序 | 日常数据仍保留，入口已下线 |
| `daily_comments` | `dailyPostId` 升序 + `createdAt` 升序 | 详情评论、首评补算 |
| `daily_comments` | `dailyPostId` 升序 + `parentId` 升序 | 判断评论是否有回复 |
| `report_posts` | `authorOpenId` 升序 + `recordAt` 降序 | 共鸣三个筛选 |
| `letters` | `senderId` 升序 + `createdAt` 降序 | 信件列表 |
| `letters` | `receiverId` 升序 + `createdAt` 降序 | 信件列表 |
| `bind_requests` | `toOpenId` 升序 + `status` 升序 | 收到的申请 |
| `bind_requests` | `fromOpenId` 升序 + `status` 升序 | 发出的申请 |
| `expenses` | `authorOpenId` 升序 + `occurredAt` 降序 | 月流水、月度总结 |
| `expenses` | `authorOpenId` 升序 + `l1` 升序 + `occurredAt` 降序 | 一级分类下钻 |
| `kitchens` | `ownerOpenId` 升序（唯一） | 每人一间厨房 |
| `kitchen_categories` | `kitchenId` 升序 + `createdAt` 升序 | 分类列表 |
| `kitchen_dishes` | `kitchenId` 升序 + `createdAt` 升序 | 菜单列表 |
| `kitchen_orders` | `ordererOpenId` 升序 + `createdAt` 降序 | 我的订单 |
| `kitchen_orders` | `ownerOpenId` 升序 + `status` 升序 + `createdAt` 降序 | 经营列表、待接单数 |
| `kitchen_orders` | `kitchenId` 升序 + `status` 升序 | 已完成次数 |

## 云函数配置

- 只有一个云函数 `api`，运行时 Node.js 12 及以上，依赖 `wx-server-sdk ~3.0.1`，部署时选「云端安装依赖」。
- 缩略图使用云存储图片处理（`imageMogr2/thumbnail`），需要按量计费环境。若环境不支持，在云函数「环境变量」中设置 `THUMBNAIL=off`，列表会直接使用原图链接。
- 对首屏敏感可在控制台为 `api` 配置 1 个常驻实例（按量计费环境），进一步消除冷启动。
