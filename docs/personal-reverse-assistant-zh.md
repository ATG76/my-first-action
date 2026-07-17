# 个人逆向助手工作流

更新日期：2026-07-17

## 1. 重新确立的目标

本项目服务于个人使用 OpenCode 处理逆向任务。它的职责不是要求用户在开始前填写未知技术细节，也不是成为网络合规控制系统。

目标是让 AI 在长任务中持续知道：用户真正要什么、哪些内容已经被证实、哪些只是工作假设、下一条应该取得什么证据、以及何时算完成。

用户可以只提供 URL、模糊业务目标、本地素材或“疑似某种保护”这样的线索。未知信息应成为待验证假设，而不是启动失败的原因。

## 2. 社区与官方依据

以下决策只采用了有官方文档或可检查社区实现支持的做法：

| 决策 | 依据 | 本项目做法 |
| --- | --- | --- |
| 重复工作流使用 Markdown command | [OpenCode Commands](https://opencode.ai/docs/commands/) | `/reverse-start` 和 `/reverse-close` 是普通 command，不由插件劫持命令执行。 |
| 领域方法留在按需加载的 skill | [OpenCode Agent Skills](https://opencode.ai/docs/skills/) | 继续使用已有 Web、Firefox、微信、小程序、AST、Node/vm 等专项 skill，不新建泛化 reverse agent。 |
| 压缩时注入短任务状态 | [OpenCode Plugins: Compaction hooks](https://opencode.ai/docs/plugins/#compaction-hooks) | 插件将本地任务简报加入官方 `experimental.session.compacting` 上下文。 |
| 长会话需要可恢复的简短上下文 | [opencode-sessions](https://github.com/malhashemi/opencode-sessions) 社区实现 | 只保留单个紧凑 brief，不引入多 agent 编排、分叉或完整 handoff 协议。 |
| 不用插件处理 slash command | [OpenCode issue #25916](https://github.com/anomalyco/opencode/issues/25916) 说明该路径不能可靠阻止后续 LLM 调用 | 命令内容只作为 prompt 模板，插件只实现实际 runtime 状态和 hook。 |

没有可靠依据且不直接服务于方向保持的能力不加入默认方案：GitHub 自动任务记忆、host 白名单、请求预算、完整 handoff 协议、自动 task manager 和新的 primary agent。

## 3. 用户如何启动

使用：

```text
/reverse-start
逆向对象：<URL 或本地 JS>
目标：<自然语言目标>
已知情况：<可为空，例如“疑似浏览器挑战”>
交付：<可为空，例如“需要 browser-free 脚本”>
```

用户不需要知道 API host、challenge host、Cookie、签名字段、请求预算或具体 skill。

AI 应先选择一个 owner skill 和 engine，然后写入以下类型的 brief：

```text
Goal: 用户要的最终结果
User-provided details: 用户给出的、尚未证实的信息
Verified evidence: 真实请求、调用栈、脚本位置或固定输入输出
Working hypotheses: 由证据引出的待验证判断
Next evidence: 下一条唯一需要取得的证据
Acceptance: 交付或明确阻塞的条件
```

保护名称、框架名称或业务猜测必须放在 `Working hypotheses`，直到真实观察证明它。

## 4. AI 的工作纪律

1. 先读取 brief，再调用浏览器工具或切换 skill。
2. 一次只推进一个可验证证据；没有真实证据时不能宣称已经还原或能 browser-free 重放。
3. 获取关键请求、调用栈、脚本入口、固定输入输出，或者排除一个假设后，更新 checkpoint。
4. 切换 owner skill 或 engine 前，先记录当前 verified evidence、hypotheses 和 next evidence。
5. 用户要求 browser-free 交付时，`Acceptance` 必须是可运行验证，或是带证据的明确阻塞原因。

## 5. 运行时边界

插件保留三个实际有用的运行时防错能力：

- 同一受控 session 只允许一个 browser engine lease。
- child session 不能使用受控父 session 的浏览器工具。
- navigation、reload、切 frame/target 或关闭浏览器后，已记录的 live source 会标记为 stale。

插件不会假装执行以下策略，因此它们不在启动表单中出现：

- host、route、request budget、延迟或并发限制。
- 自动判断某次网络请求是否使用了账号态。
- 自动判断 `evaluate_js` 内隐藏的网络行为。

需要使用登录态、账号、写操作、购买或其他敏感动作时，AI 应在该动作之前调用 `reverse_control(action: "confirm")`。这是一项用户确认记录，不是对所有浏览器行为的安全沙箱。

## 6. 状态、Git 和隐私

任务 brief 保存在本机 `%LOCALAPPDATA%\OpenCode\reverse-assistant\sessions`，不写入 Git。状态拒绝敏感字段和常见凭据形态值。

公共 GitHub 仓库只保存插件、命令、测试、脱敏文档和通用方法。客户名称、商业目标、真实请求/响应、Cookie、token、账号状态和浏览器 profile 默认不进入仓库。需要版本化某项商业任务时，应使用用户明确选择的私有仓库。

Git 的作用是保存代码和决策历史，便于比较、审查和回退；它不会自动成为模型记忆。模型恢复上下文依赖本地 brief 和官方 compaction hook。

## 7. 历史与验证

此前的严格控制面实验已归档在本地 Git 分支 `archive/reverse-control-strict-20260717`，提交 `dc9537d`。该分支保留比较价值，不继续作为默认方案。

离线测试验证任务启动、engine lease、child session 隔离、checkpoint、source stale、on-demand confirmation、敏感状态拒绝和 compaction context。真实浏览器、真实站点和商业任务仍必须在本地、获得适当授权的条件下单独验证。
