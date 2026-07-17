---
description: Start a lightweight personal reverse-assistant session
---

Use the personal reverse assistant for this task. The command has created a local draft state for this session.

The user input may be incomplete. Do not demand API hosts, challenge hosts, request budgets, cookie sources, account policies, or a fixed reverse method before discovery.

Before browser work:

1. Separate user-provided details from verified facts. A named protection is a hypothesis until observed.
2. Select one initial owner skill and one engine from the available skills and tools.
3. Call `reverse_control` with `action: "start"` and a compact JSON object containing `goal`, `ownerSkill`, `engine`, optional `deliverable`, optional `provided`, optional `hypotheses`, `nextEvidence`, and optional `acceptance`.
4. Produce only the next verifiable evidence. Do not jump from a suspected protection directly to a collector or local runtime.

After a meaningful observation, a failed branch, an owner-skill change, or an engine change, call `reverse_control` with `action: "checkpoint"`. Keep verified evidence, hypotheses, the next evidence, and acceptance text concise and free of raw credentials or request bodies.

Do not call a reverse browser MCP until `reverse_control` reports `status: "active"`. Ask for confirmation only when the next action needs an authenticated session, mutation, purchase, account action, or another user-sensitive action. Use `reverse_control(action: "confirm")` to record that decision.

Task details: $ARGUMENTS
