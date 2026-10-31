# Moilike

情侣间私密互动小程序，基于微信云开发。四大模块：朝夕（纪念日 + 信件）、浮生（日常）、共鸣（报备）、独白（个人资料）。

## 技术栈

| 层 | 技术 |
|---|------|
| 渲染 | 原生小程序 + Skyline 渲染引擎 + glass-easel 组件框架 |
| 前端语言 | TypeScript，`scripts/build.mjs` 用 esbuild 逐文件编译为 ES2017 |
| 样式 | WXSS + CSS 变量设计令牌（`src/app.wxss`） |
| 后端 | 单一云函数 `api`（Node.js，`wx-server-sdk ~3.0.1`） |
| 数据 | CloudBase 文档数据库 + 私有云存储（服务端批量签名链接） |

## 快速开始

```bash
npm install
cp project.config.example.json project.config.json            # 填入 AppID
cp project.private.config.example.json project.private.config.json
npm run build                                                  # 首次打开前必须先编译出 miniprogram/
```

用微信开发者工具打开仓库根目录。开发者工具只读取编译产物 `miniprogram/`（不提交到 git），源码一律改 `src/`：

- `project.config.json` 的 `scripts` 已配置编译 / 预览 / 上传前自动执行 `npm run build`，在开发者工具里点「编译」即可。
- 想保存即生效，另开终端运行 `npm run dev` 监听 `src/` 变更。

## 部署

1. 按 [docs/DATABASE.md](docs/DATABASE.md) 创建集合与索引（全部「仅云函数可读写」）。
2. 开发者工具中右键 `cloudfunctions/api` →「上传并部署：云端安装依赖」。
3. `npm run build` 后上传小程序代码。
4. 小程序管理后台 →「用户隐私保护指引」声明头像、昵称、相册 / 相机、剪贴板。

从旧版本升级：先部署 `api`，再发布新版前端；新版全量后，在云开发控制台删除旧的 `user`、`daily`、`report`、`letters` 四个云函数。旧数据无需迁移，帖子缺少的评论摘要会在第一次读取时自动补齐。

## 本地检查

```bash
npm run check          # 类型检查 + 接口测试 + 源码自检 + 构建（提交前跑这个）
npm test               # cloudfunctions/api 端到端测试（内存版 wx-server-sdk）
npm run check:sources  # Skyline 兼容规则、设计令牌、组件引用
```

验收与回归见 [docs/REGRESSION.md](docs/REGRESSION.md)。

## 项目结构

```
src/                         小程序源码（编译到 miniprogram/）
├── app.ts / app.json / app.wxss
├── core/                    api 调用、全局状态、列表控制器、展示映射、格式化、媒体
├── components/              app-nav、state-view、daily-card、report-card、image-grid、image-picker、together-clock
├── pages/                   Tab 页：milestones（首页）、moments、resonance、profile，以及 login
├── subpackages/             moments / resonance / letters / user 分包
└── types/api.ts             与云函数一一对应的接口类型
cloudfunctions/api/          唯一云函数：index.js 路由 + lib/ 公共逻辑 + routes/ 各业务域
tests/                       接口测试与 wx-server-sdk 替身
scripts/                     build.mjs、check-sources.mjs
docs/                        数据库说明、验收清单
```
