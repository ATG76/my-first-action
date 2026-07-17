# OpenCode Reverse Control Plane

Session-scoped reverse-engineering control plugin for OpenCode.

## Included

- Reverse engine leases
- Monotonic handoff checks
- Browser tool restrictions for child sessions
- Source lifecycle tracking
- Offline tests

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

## Verification Scope

GitHub Actions runs only the offline test suite. Browser engines, account-bound
state, live requests, and target-site collection remain local, explicit, and
out of the repository.
