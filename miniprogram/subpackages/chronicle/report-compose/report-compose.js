'use strict'

/**
 * 与同名 report-compose.ts 并存时，工具优先采用 .ts（project.config → setting.useCompilerPlugins 含 typescript）。
 * 部分环境下的 app.json 校验仍会查找本文件；勿在本文件写业务逻辑。
 */
Component({})
