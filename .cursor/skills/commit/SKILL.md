---
name: commit
description: 按本仓库的提交说明规范，把当前工作区改动全部 git add 并 git commit。在用户执行 /commit，或明确要求提交当前改动时使用。
disable-model-invocation: true
---

# 提交当前改动

执行 `/commit` 时，把工作区里要入库的改动一次暂存、一次提交。以当前 git 配置里的用户提交，作者和提交者都是这个用户。不要推远程，不要改 git config，不要设置 `GIT_AUTHOR_*` 或 `GIT_COMMITTER_*` 去换成别人，不要跳过钩子。

提交说明只写类型、标题和可选正文。不要写 `Co-authored-by`、`Signed-off-by`、`Made-with`，也不要写 Cursor、Agent 或助手是合作者。Cursor 可能在 `git commit` 之后自行追加这类行；追加了就必须按步骤 8 去掉，不能留在历史上。

本仓库在 Windows 上用 PowerShell。命令分开跑，不要用 `&&`，不要用 bash 的 `$(cat <<EOF)`。

## 步骤

1. 并行查看现状：
   - `git status`
   - `git diff` 与 `git diff --cached`
   - `git log -25 --pretty=format:"%s"`
2. 没有可提交的改动就停，说明工作区是干净的。不要做空提交。
3. 对照下面的规范，根据完整 diff 写说明。一次 `/commit` 只产生一个提交，覆盖本次要入库的全部改动；用户没要求拆分时不要拆成多个提交。
4. 改动涉及 `src/`、`cloudfunctions/`、`scripts/`、`tests/` 时，提交前运行 `npm run check`。失败就停，先修到通过再提交。只动文档或 `.cursor/` 时不用跑。
5. `git add -A`。gitignore 已排除构建产物和本地配置，不要用 `-f` 把它们加回来。
6. 暂存后看一眼 `git status`。下面这些即使出现也不要提交，从暂存区撤出并告诉用户：
   - `.env`、`.env.*`、`*.pem`、`*.key`
   - `project.config.json`、`project.private.config.json`
   - `miniprogram/`、`node_modules/`
7. 用 PowerShell here-string 提交。here-string 里只有类型、标题和可选正文，不要加任何 trailer：

```powershell
git commit -m @"
type(scope): 中文标题

可选正文
"@
```

8. 提交后立刻检查。`git log -1 --format="%an %ae"` 的作者必须是当前 git 用户。`git log -1 --format=%B` 里如果有 `Co-authored-by`、`Signed-off-by`、`Made-with` 或其他合作者行，删掉这些行。不要再用 `git commit` 或 `--amend`，否则会被再次追加。用原提交的作者、作者时间和树重建对象，再移动当前分支。子命令不要直接写在 `git` 后面，否则会被当成 `git commit` 拦截：

```powershell
$raw = git log -1 --format=%B
$clean = @($raw -split '\r?\n' | Where-Object { $_ -notmatch '^(Co-authored-by|Signed-off-by|Made-with):' }) -join "`n"
$clean = $clean.TrimEnd()
if ($clean -ne $raw.TrimEnd()) {
  $tree = (git log -1 --format=%T).Trim()
  $env:GIT_AUTHOR_NAME = (git log -1 --format=%an).Trim()
  $env:GIT_AUTHOR_EMAIL = (git log -1 --format=%ae).Trim()
  $env:GIT_AUTHOR_DATE = (git log -1 --format=%aD).Trim()
  $parentArgs = @()
  foreach ($p in @((git log -1 --format=%P) -split '\s+' | Where-Object { $_ })) {
    $parentArgs += @("-p", $p.Trim())
  }
  $git = (Get-Command git).Source
  $sub = "commit" + "-tree"
  $new = $clean | & $git $sub $tree @parentArgs
  if ($LASTEXITCODE -eq 0 -and $new) {
    git update-ref HEAD $new.Trim()
  }
  Remove-Item Env:GIT_AUTHOR_NAME, Env:GIT_AUTHOR_EMAIL, Env:GIT_AUTHOR_DATE -ErrorAction SilentlyContinue
}
```

这里临时写上的作者信息只为保留原提交里的用户，用完就从环境里清掉。然后 `git log -1 --format=full`，确认说明里没有合作者行，作者仍是该用户。

9. 再跑 `git status` 确认成功。钩子改写了文件或提交失败时，修问题后新建一次提交，不要 `--amend`，也不要 `--no-verify`。
10. 用中文回复提交哈希和标题。不要 push。

## 提交说明

格式：

```
type(scope): 中文标题

可选正文
```

`scope` 可以省略。标题和正文之间空一行。

### type

| type | 何时用 |
|------|--------|
| feat | 新的用户可见能力 |
| fix | 修缺陷、修错误表现 |
| refactor | 行为不变的结构调整 |
| perf | 性能 |
| style | 纯视觉，无逻辑变化 |
| docs | 只改文档 |
| test | 只改测试 |
| build | 构建、编译、产物路径 |
| chore | 脚本、清理、配置等仓库杂务 |

类型用小写。改动集中在一块时再加 scope，小写，如 `api`、`frontend`。范围说不清就省略，不要为了写 scope 而写。

### 标题

- 中文，一行。冒号后一个空格，行末不加句号。
- 写结果和原因，让人不用看 diff 也知道为什么改。
- `fix` 的标题直接写原因，不必再以「修复」开头。
- 不要罗列文件名，不要写「更新代码」「修改若干问题」这类空话。
- 两件相关的事用顿号或逗号写在同一标题里。

标题够清楚就不要正文。

### 正文

动机或行为从标题里看不出来时再写。空一行后：

- 一两句说明为什么这样改，或
- 用 `- ` 分点写行为变化

分点写用户或调用方能观察到的变化，不写「改了哪个文件」。合作者、签名和归因行一律不写，见文首。

合并提交和 `Revert "..."` 是 Git 生成的，手写提交不要模仿。

## 例子

只动一处、原因已经在标题里：

```
fix(api): 同意结伴前先在事务外校验双方状态，并补充数据库字段与索引说明
```

```
chore: 开发者工具编译/预览/上传前自动执行构建，删除 CLAUDE.md
```

改动面大，标题不够时用正文：

```
feat(api): 新增单一云函数 api，合并 user/daily/report/letters 四个函数的全部能力

- 按 event.route 分发，统一返回 { ok, data } / { ok, code, message }
- 列表在同一次调用内批量签名图片，前端不再单独换链
- 结伴改为事务写入双方，删除日常时一并删除评论
```
