# Git 与 GitHub 操作手册

本文记录 OpenCode Reverse Control Plane 仓库的当前状态，并提供以后可以直接照着执行的 Git/GitHub 操作流程。

## 1. 当前状态

记录日期：2026-07-17。

| 项目 | 当前值 |
| --- | --- |
| GitHub 仓库 | `https://github.com/ATG76/my-first-action` |
| 仓库可见性 | Public（公开） |
| 默认分支 | `main` |
| 本地源码目录 | `D:\Projects\opencode-reverse-control` |
| OpenCode 运行目录 | `C:\Users\Administrator\.config\opencode` |
| Git 程序 | `C:\Program Files\Git\cmd\git.exe` |
| 已验证功能基线 | `3deed2c chore: add deployment and offline CI` |
| 离线测试 | 11 项全部通过 |
| GitHub Actions | 首次 `Test` workflow 运行成功 |
| 部署方式 | `scripts\deploy.ps1` |

功能基线是编写本文前最后一个已经完成本地测试、部署验证和 GitHub Actions 验证的提交。文档提交后，`main` 会产生更新的提交号；以后应使用 `git log --oneline -5` 查看最新提交。

## 2. 三个位置分别是什么

### 本地源码仓库

路径：`D:\Projects\opencode-reverse-control`。

这里是唯一应该修改代码、测试、提交和推送的地方。该目录包含 `.git`，因此 Git 能记录文件变化和提交历史。

### GitHub 远端仓库

地址：`https://github.com/ATG76/my-first-action`。

这里保存已经 `push` 的提交，提供远端备份、历史查看和 GitHub Actions。修改本地文件不会自动改变 GitHub，必须经过 `commit` 和 `push`。

### OpenCode 运行目录

路径：`C:\Users\Administrator\.config\opencode`。

OpenCode 从这里加载插件、命令和配置。这里包含 `opencode.json`、密钥配置和其他本机内容，不能整体提交到公开仓库。源码通过部署脚本从本地仓库单向复制到这里。

正确的数据流是：

```text
本地源码仓库 -> 测试 -> Git commit -> GitHub push
       |
       +-> deploy.ps1 -> OpenCode 运行目录 -> 重启 OpenCode
```

## 3. 仓库目录说明

| 路径 | 用途 |
| --- | --- |
| `plugins/reverse-control.js` | OpenCode 自动加载的插件入口 |
| `commands/reverse-start.md` | `/reverse-start` 命令 |
| `commands/reverse-close.md` | `/reverse-close` 命令 |
| `reverse-control/` | 状态机、策略、handoff 校验和状态存储代码 |
| `reverse-control/tests/` | 不访问真实网站的离线测试 |
| `scripts/deploy.ps1` | 测试通过后部署到 OpenCode 运行目录 |
| `.github/workflows/test.yml` | GitHub Actions 离线测试配置 |
| `.gitignore` | 阻止敏感文件和临时文件进入 Git |
| `package.json` / `package-lock.json` | Node.js 依赖及锁定版本 |

`node_modules/` 是 `npm ci` 生成的依赖目录，不应提交。

## 4. Git 与 GitHub 的基本概念

- `git status`：查看本地有哪些变化。
- `git diff`：查看尚未暂存的具体变化。
- `git add <文件>`：选择本次准备提交的文件。
- `git diff --cached`：检查已经暂存、即将进入提交的内容。
- `git commit`：在本地创建一个有说明的历史节点。
- `git push`：把本地提交上传到 GitHub。
- `git pull --ff-only`：安全获取 GitHub 上的新提交，不自动制造合并提交。
- GitHub Actions：GitHub 收到 push 后，在云端重新运行测试。

GitHub 仓库不能代替本机 Git。Git 负责本地版本控制，GitHub 负责远端托管。

## 5. 查看当前状态

打开 PowerShell：

```powershell
cd D:\Projects\opencode-reverse-control
git status
git branch --show-current
git log --oneline -5
git remote -v
```

正常状态应包含：

```text
On branch main
nothing to commit, working tree clean
```

`origin` 应指向：

```text
https://github.com/ATG76/my-first-action.git
```

`git status --short` 常见标记：

| 标记 | 含义 |
| --- | --- |
| `M file` | 文件已修改但未暂存 |
| `M  file` | 文件修改已暂存 |
| `A  file` | 新文件已暂存 |
| `?? file` | Git 尚未跟踪的新文件 |
| 无输出 | 工作区干净 |

## 6. 每次开始修改前

```powershell
cd D:\Projects\opencode-reverse-control
git status
git pull --ff-only
npm ci
node --test reverse-control\tests\reverse-control.test.mjs
```

各命令作用：

1. 确认当前目录正确且没有遗留变化。
2. 获取 GitHub 上的最新提交。
3. 按 `package-lock.json` 安装一致的依赖。
4. 验证当前基线没有损坏。

如果 `git status` 显示不认识的变化，先停止，不要执行 pull、add、commit 或覆盖文件。

## 7. 修改完成后的标准流程

先测试和检查：

```powershell
node --test reverse-control\tests\reverse-control.test.mjs
git diff --check
git status --short
git diff
```

只暂存确认属于本次修改的文件。例如：

```powershell
git add README.md docs\github-operations-zh.md
git diff --cached --check
git diff --cached
```

确认暂存内容正确后提交和推送：

```powershell
git commit -m "docs: add GitHub operations guide"
git push origin main
```

不要习惯性使用 `git add .`。它可能把逆向产物、网络导出或其他未审查文件一起暂存。

## 8. 部署到 OpenCode

只预演、不复制：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy.ps1 -WhatIf
```

预演会运行离线测试，并显示准备复制的文件。确认无误后实际部署：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy.ps1
```

部署脚本会：

1. 运行离线测试，失败时停止。
2. 复制插件、两个命令和 `reverse-control/`。
3. 不复制 `opencode.json`、备份和 `node_modules/`。
4. 导入运行时插件，确认 `reverse_control` 工具成功注册。

部署后必须完全退出并重启 OpenCode，因为插件和命令只在启动时加载。

## 9. 查看 GitHub Actions

打开：

`https://github.com/ATG76/my-first-action/actions`

- 绿色对勾：云端测试通过。
- 黄色圆点：测试正在运行。
- 红色叉号：测试失败，应打开该次运行查看失败步骤。

Actions 只执行离线测试，不启动浏览器、不访问目标站、不使用账号状态。

## 10. 哪些内容绝对不能提交

该仓库是公开仓库，任何提交过的内容都可能被他人永久保存。禁止提交：

- `opencode.json`、`opencode.json.backup` 及其他配置备份。
- API key、token、Authorization、Cookie、密码或私钥。
- HAR、浏览器 profile、存储状态、完整请求体和响应体。
- 真实账号数据、验证码素材和未脱敏逆向样本。
- `js_reverse_cache/`、session state、trace 和临时网络导出。

`.gitignore` 只是第一层保护。提交前仍必须查看 `git diff --cached`。

## 11. 常见问题

### 提示找不到 git

关闭并重新打开 PowerShell 或 OpenCode。仍然失败时使用：

```powershell
& "C:\Program Files\Git\cmd\git.exe" --version
```

### `git pull --ff-only` 失败

这通常表示本地和远端各自有新提交。不要使用 force、reset 或随意合并。先执行：

```powershell
git status
git log --oneline --graph --decorate --all -10
```

保留输出并让工程人员判断。

### `git push` 被拒绝

先执行 `git pull --ff-only`。如果提示身份验证，按 Git Credential Manager 打开的浏览器页面登录 GitHub。不要把 GitHub 密码或 token 写入仓库文件。

### 测试失败

不要部署、commit 或 push。先查看失败测试的名称和错误堆栈，修复后重新运行完整测试。

### GitHub Actions 失败但本机通过

检查 Actions 中的 Node 版本、`npm ci` 和测试步骤输出。不要重复 push 无关提交来碰运气。

### 提交错了但还没有 push

先停止并查看：

```powershell
git status
git log --oneline -3
git show --stat HEAD
```

不要自行使用 `reset --hard`、`checkout --` 或强制推送。

### 已经把敏感信息 push 到 GitHub

仅删除文件或再提交一次不能从历史中消除秘密。应立即：

1. 撤销并轮换对应密钥。
2. 停止继续 push。
3. 使用专业历史清理流程处理仓库。
4. 检查 GitHub Actions、fork 和 clone 是否可能保留副本。

## 12. 安全回滚

推荐使用 `git revert` 创建一个明确的反向提交，而不是改写公开历史：

```powershell
git log --oneline -10
git show <提交号>
git revert <提交号>
git push origin main
```

执行 revert 前应确认目标提交是否包含多个文件，以及后续提交是否依赖它。不要对公开 `main` 使用 force push。

## 13. 最短日常清单

开始工作：

```powershell
cd D:\Projects\opencode-reverse-control
git status
git pull --ff-only
npm ci
node --test reverse-control\tests\reverse-control.test.mjs
```

完成工作：

```powershell
node --test reverse-control\tests\reverse-control.test.mjs
git diff --check
git status --short
git add <本次确认过的文件>
git diff --cached
git commit -m "类型: 简短说明"
git push origin main
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy.ps1
```

最后重启 OpenCode，并确认 GitHub Actions 变成绿色。
