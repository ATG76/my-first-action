import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  checkpoint,
  closeSession,
  formatTaskBrief,
  markSourcesStale,
  recordEngineLifecycle,
  recordSource,
  startSession,
  switchEngine,
} from "../controller.mjs";
import { evaluateToolCall } from "../policy.mjs";
import { ensureDraft, loadEffectiveState, newDraftState, registerChildSession, saveState } from "../state-store.mjs";
import reverseControlPlugin from "../../plugins/reverse-control.js";

function activeState(sessionID = "parent", overrides = {}) {
  return startSession(newDraftState(sessionID), {
    goal: "Find the request path and produce a reproducible result.",
    ownerSkill: "camoufox-js-reverse",
    engine: "camoufox",
    provided: ["The page may be protected."],
    hypotheses: ["A browser challenge may be present."],
    nextEvidence: "Capture the first relevant request and its initiator.",
    acceptance: "Record one verified request path or a concrete blocker.",
    ...overrides,
  });
}

test("draft sessions block browser tools until the assistant selects an engine", () => {
  const result = evaluateToolCall({
    state: newDraftState("draft"),
    isChild: false,
    toolName: "camoufox-reverse-mcp_navigate",
  });
  assert.equal(result.allow, false);
  assert.match(result.reason, /reverse_control\.start/);
});

test("a sparse task starts without host, budget, or account policy fields", () => {
  const state = activeState();
  assert.equal(state.status, "active");
  assert.equal(state.brief.goal, "Find the request path and produce a reproducible result.");
  assert.equal("scope" in state, false);
  assert.equal("phase" in state, false);
});

test("an engine lease permits only its active browser engine", () => {
  const state = activeState();
  assert.equal(evaluateToolCall({ state, isChild: false, toolName: "camoufox-reverse-mcp_navigate" }).allow, true);
  assert.equal(evaluateToolCall({ state, isChild: false, toolName: "firefox-reverse-ai-mcp_agent_start" }).allow, false);
});

test("CloakBrowser retains its js-reverse tool family without normal-browser launches", () => {
  const state = activeState("cloak", { engine: "cloakbrowser" });
  assert.equal(evaluateToolCall({ state, isChild: false, toolName: "js-reverse_navigate" }).allow, true);
  assert.equal(evaluateToolCall({ state, isChild: false, toolName: "js-reverse_launch_browser", toolArgs: {} }).allow, false);
  assert.equal(evaluateToolCall({
    state,
    isChild: false,
    toolName: "js-reverse_launch_browser",
    toolArgs: { cloakBinaryPath: "C:/CloakBrowser.exe" },
  }).allow, true);
});

test("child sessions cannot use browser reverse tools from a controlled parent", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-assistant-"));
  try {
    await saveState(activeState(), root);
    await registerChildSession("child", "parent", root);
    const effective = await loadEffectiveState("child", root);
    assert.equal(effective.isChild, true);
    assert.equal(evaluateToolCall({ ...effective, toolName: "camoufox-reverse-mcp_navigate" }).allow, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkpoints separate verified evidence from working hypotheses", () => {
  const state = checkpoint(activeState(), {
    ownerSkill: "env-patch",
    verified: ["Request r-17 has a call stack in bundle.js."],
    hypotheses: ["The signature code can run in a local runtime."],
    nextEvidence: "Run the located function with the captured inputs.",
  });
  assert.equal(state.ownerSkill, "env-patch");
  assert.deepEqual(state.brief.verified, ["Request r-17 has a call stack in bundle.js."]);
  assert.deepEqual(state.brief.hypotheses, ["The signature code can run in a local runtime."]);
  assert.match(formatTaskBrief(state), /Verified evidence/);
  assert.match(formatTaskBrief(state), /Working hypotheses/);
});

test("sources become stale after navigation and close reports warnings without blocking", () => {
  const withSource = recordSource(activeState(), { kind: "request", id: "r1", status: "live" });
  assert.equal(markSourcesStale(withSource).sourceIds[0].status, "stale");
  const result = closeSession(withSource);
  assert.equal(result.state.status, "closed");
  assert.ok(result.warnings.length > 0);
  assert.equal(result.liveSources[0].id, "r1");
});

test("engine changes require the current browser to be parked or closed", () => {
  const state = activeState();
  assert.throws(() => switchEngine(state, "js-reverse"));
  const switched = switchEngine(recordEngineLifecycle(state, "parked"), "js-reverse");
  assert.equal(switched.engine, "js-reverse");
  assert.equal(switched.engineLifecycle, "active");
  const reopened = switchEngine(recordEngineLifecycle(state, "closed"), "camoufox");
  assert.equal(reopened.engineLifecycle, "active");
});

test("state storage rejects sensitive field names and credential-like values", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-assistant-"));
  try {
    await assert.rejects(() => saveState({ ...newDraftState("secret-field"), token: "must-not-write" }, root));
    await assert.rejects(() => saveState({ ...newDraftState("secret-value"), brief: { goal: "Bearer abcdefghijklmnopqrstuvwxyz" } }, root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the plugin injects the compact task brief and keeps browser state isolated", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-assistant-plugin-"));
  const prior = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = root;
  try {
    const hooks = await reverseControlPlugin();
    const context = { sessionID: `plugin-${randomUUID()}`, directory: "C:/project", ask: async () => {} };
    await hooks["command.execute.before"]({ command: "reverse-start", sessionID: context.sessionID });
    await hooks.tool.reverse_control.execute({
      action: "start",
      fields: JSON.stringify({
        goal: "Locate a public request path.",
        ownerSkill: "camoufox-js-reverse",
        engine: "camoufox",
        hypotheses: ["A challenge may be present."],
        nextEvidence: "Capture the request initiator.",
      }),
    }, context);
    await assert.rejects(() => hooks["tool.execute.before"]({
      tool: "firefox-reverse-ai-mcp_agent_start",
      sessionID: context.sessionID,
    }, { args: {} }));
    await hooks["tool.execute.after"]({
      tool: "camoufox-reverse-mcp_navigate",
      sessionID: context.sessionID,
      args: {},
    }, { output: "" });
    const compacting = { context: [] };
    await hooks["experimental.session.compacting"]({ sessionID: context.sessionID }, compacting);
    assert.equal(compacting.context.length, 1);
    assert.match(compacting.context[0], /Locate a public request path/);
    assert.match(compacting.context[0], /Capture the request initiator/);
  } finally {
    if (prior === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("on-demand confirmations are recorded only when the assistant requests one", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-assistant-confirm-"));
  const prior = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = root;
  try {
    let asked = 0;
    const hooks = await reverseControlPlugin();
    const context = {
      sessionID: `confirm-${randomUUID()}`,
      directory: "C:/project",
      ask: async () => { asked += 1; },
    };
    await hooks.tool.reverse_control.execute({
      action: "start",
      fields: JSON.stringify({ goal: "Verify a flow.", ownerSkill: "camoufox-js-reverse", engine: "camoufox" }),
    }, context);
    const result = JSON.parse(await hooks.tool.reverse_control.execute({
      action: "confirm",
      topic: "authenticated-session",
      note: "Using a logged-in browser session is required for the next observation.",
    }, context));
    assert.equal(asked, 1);
    assert.equal(result.confirmations[0].topic, "authenticated-session");
  } finally {
    if (prior === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("children created before a parent starts become restricted once it starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-assistant-child-"));
  const prior = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = root;
  try {
    const hooks = await reverseControlPlugin();
    await hooks.event({ event: { type: "session.created", properties: { info: { id: "child", parentID: "parent" } } } });
    await hooks["command.execute.before"]({ command: "reverse-start", sessionID: "parent" });
    const effective = await loadEffectiveState("child");
    assert.equal(effective.isChild, true);
  } finally {
    if (prior === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("ensureDraft is idempotent and fills the project root after command setup", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-assistant-"));
  try {
    await ensureDraft("one", null, root);
    const second = await ensureDraft("one", "C:/project", root);
    assert.equal(second.projectRoot, "C:/project");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
