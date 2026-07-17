---
description: Close or pause a personal reverse-assistant session
---

Read `reverse_control(action: "status")` first. If an engine is active, close or park it when practical and state what remains unresolved. Record one final concise checkpoint when the next evidence or blocker changed.

Call `reverse_control` with `action: "close"`. It reports unresolved source references as warnings rather than blocking the user from ending the task. Do not claim cleanup occurred unless it was observed. Do not use a full handoff packet and do not put raw credentials or bodies into the task brief.
