# OpenCode Personal Reverse Assistant

A lightweight session assistant for keeping OpenCode reverse-engineering work
grounded in evidence and recoverable after long conversations.

中文 Git/GitHub 操作、部署和故障处理说明见
[Git 与 GitHub 操作手册](docs/github-operations-zh.md)。

个人逆向助手的工作流、设计依据和明确不做的事情见
[个人逆向助手工作流](docs/personal-reverse-assistant-zh.md)。

## Purpose

This project helps an AI keep a reverse task on track when the user can only
provide a URL, a broad outcome, or an incomplete suspicion about a protection.
It records a short task brief with user-provided details, verified evidence,
working hypotheses, the next evidence, and the acceptance condition.

It does not try to make the user predict API hosts, challenge hosts, request
budgets, cookies, or account policies before discovery begins.

## Included

- Reverse engine leases
- Browser tool restrictions for child sessions
- Source lifecycle tracking
- Compact evidence-oriented task briefs
- Official OpenCode compaction-context injection
- On-demand confirmation for an authenticated session or other user-approved action
- Credential-shaped state rejection
- Offline tests

## Deliberately Excluded

- Host or route allowlists
- Request budgets, delay policies, and concurrency policies
- Mandatory multi-field handoff packets
- GitHub synchronization for live task state
- A new primary reverse agent or additional browser MCP

## Repository Boundary

This repository is the versioned source for the plugin, commands, and tests.
It is intentionally separate from the global OpenCode configuration directory.
Do not commit `opencode.json`, provider keys, browser profiles, network exports,
cookies, tokens, raw headers, or request and response bodies.

## Local Workflow

Run the offline tests before every deployment:

```powershell
node --test reverse-control\tests\reverse-control.test.mjs
```

Deploy only the tracked runtime artifacts into the global OpenCode directory:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1
```

Use `-WhatIf` to validate the copy plan without changing the runtime:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\deploy.ps1 -WhatIf
```

Restart OpenCode after deployment. The plugin and commands are loaded only at
startup.

## Personal Workflow

Start a task with `/reverse-start` and free-form text. The user may leave
technical details unknown. The assistant selects an initial owner skill and
engine, then calls `reverse_control.start` with a compact brief before browser
work. It checkpoints only after meaningful evidence or a direction change.

The assistant should ask before using an authenticated session, sending a
mutation, or performing another user-sensitive action. It should not ask for
network host lists or request budgets at intake.

## Verification Scope

GitHub Actions runs only the offline test suite. Browser engines, account-bound
state, live requests, and target-site collection remain local, explicit, and
out of the repository.
