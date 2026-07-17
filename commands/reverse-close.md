---
description: Close a controlled reverse-engineering session
---

Call `reverse_control` with `action: "close"` for this session. Report every remaining live source ID and cleanup obligation. Do not claim cleanup occurred unless it is recorded. If there is a cross-skill transfer, validate the canonical `reverse-handoff/v1` packet first; do not put raw credentials or body data into the ledger.
