# Moilike

情侣间私密互动小程序，基于微信云开发。包含日常记录（浮生）、报备（共鸣）、纪念日（朝夕）、个人资料（独白）四大模块。

## 技术栈

| 层 | 技术 |
|---|------|
| 渲染引擎 | Skyline（微信小程序新一代渲染） |
| 前端语言 | TypeScript |
| 样式 | WXSS（CSS 自定义属性做设计令牌） |
| 后端 | 微信云开发 · 云函数（Node.js） |
| 数据库 | 微信云开发 · CloudBase 文档数据库 |
| 存储 | 微信云开发 · 云存储 |

## 前置条件

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（最新稳定版）
- 已注册的微信小程序 AppID（[注册地址](https://mp.weixin.qq.com/)）
- 开通云开发能力（在微信开发者工具中点击「云开发」按指引开通）

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url> moilike
cd moilike

# 2. 配置项目文件
cp project.config.example.json project.config.json
cp project.private.config.example.json project.private.config.json
```

编辑 `project.config.json`，将 `"appid": "your-appid-here"` 替换为你的小程序 AppID。

```bash
# 3. 安装云函数依赖
cd cloudfunctions/user && npm install && cd ../..
cd cloudfunctions/daily && npm install && cd ../..
cd cloudfunctions/report && npm install && cd ../..

# 4. 用微信开发者工具打开项目根目录
```

## 部署云函数

在微信开发者工具中：

1. 右键 `cloudfunctions/user` → **上传并部署：云端安装依赖**
2. 对 `cloudfunctions/daily` 和 `cloudfunctions/report` 重复上述操作
3. 在「云开发控制台」→「数据库」中创建集合：
   - `users` — 用户资料与结伴关系
   - `dailies` — 日常记录
   - `reports` — 报备记录
   - `bind_requests` — 绑定请求
   - `report_tags` — 报备标签（全局共享）

> 数据库权限建议：除 `report_tags` 可设为「所有用户可读，仅云函数可写」外，其余集合均设为「仅云函数可读写」。

## 项目结构

```
moilike/
├── miniprogram/                  # 小程序前端
│   ├── app.json                  # 应用配置（路由、TabBar、Skyline）
│   ├── app.ts                    # 应用入口
│   ├── app.wxss                  # 全局样式 + CSS 设计令牌
│   ├── behaviors/                # 通用 Behavior（如 require-auth）
│   ├── components/               # 全局组件（app-nav）
│   ├── constants/                # 常量与路径定义
│   ├── images/                   # 图标资源
│   ├── pages/                    # 主 Tab 页面
│   │   ├── login/                # 登录页
│   │   ├── milestones/           # 朝夕 — 纪念日
│   │   ├── moments/              # 浮生 — 日常记录
│   │   ├── resonance/            # 共鸣 — 报备
│   │   └── profile/              # 独白 — 个人资料
│   ├── subpackages/              # 分包
│   │   ├── moments/              # 日常详情/编辑页
│   │   ├── resonance/            # 报备详情/编辑页
│   │   └── user/                 # 资料编辑/结伴/偏好
│   ├── types/                    # TypeScript 类型定义
│   └── utils/                    # 工具函数
│       ├── api/                  # 云函数调用封装
│       ├── display/              # 展示逻辑（头像/Feed 数据转换）
│       └── upload/               # 上传逻辑
├── cloudfunctions/               # 云函数
│   ├── user/                     # 用户：资料/绑定/纪念日/偏好
│   ├── daily/                    # 日常：CRUD/评论/媒体
│   └── report/                   # 报备：CRUD/评价/媒体/标签
├── typings/                      # 微信 API 类型声明
├── project.config.example.json   # 项目配置模板（需复制并填 AppID）
└── project.private.config.example.json
```

## 开发说明

### 设计令牌

全局样式变量定义在 `miniprogram/app.wxss` 的 `page` 选择器中：

```css
page {
  --mo-l0-bg: #f2f2f7;
  --mo-l1-card: #ffffff;
  --mo-text-primary: #1c1c1e;
  --mo-brand-teal: #668f80;
  --mo-brand-slate: #4a6670;
  --mo-gradient-brand: linear-gradient(155deg, #668f80 0%, #4a6670 100%);
  /* ... */
}
```

### 代码规范

- 页面/组件使用 TypeScript 编写，遵循 `Component<Data, Property, Methods, CustomInstanceProperty>` 泛型模式
- 云函数采用薄路由 + action 文件 + helpers 提取的模式
- 无拼音命名、无中文注释、英文 commit message

## License

Private — 仅供个人使用。
