---
description: Initialize a controlled reverse-engineering session
---

Use the Reverse Control Plane for this task. The command already created a draft ledger for this session.

Before any browser, network, source-capture, or worker tool call, call `reverse_control` with `action: "configure"`. Supply only metadata: chosen engine, owner skill, authorization basis, exact host/route prefixes, action class, account/session policy, browser reconnaissance policy, live replay policy, and a bounded request budget. Do not include raw headers, cookies, tokens, request bodies, or response bodies.

Do not call a reverse browser MCP until `reverse_control` reports `status: "active"`. Then load the one skill that owns the current phase and produce the next verifiable evidence only.

Task details: $ARGUMENTS
