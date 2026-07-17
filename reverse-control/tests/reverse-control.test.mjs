import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { configure, markSourcesStale, recordSource, switchEngine, transition } from "../controller.mjs";
import { validateHandoff } from "../handoff-schema.mjs";
import { evaluateToolCall } from "../policy.mjs";
import { ensureDraft, loadEffectiveState, registerChildSession, saveState } from "../state-store.mjs";
import reverseControlPlugin from "../../plugins/reverse-control.js";

function configuredState(sessionID = "parent") {
  return configure({
    ...(awaitableDraft(sessionID)),
  }, {
    engine: "camoufox",
    ownerSkill: "camoufox-js-reverse",
    scope: {
      authorizationBasis: "public-unauthenticated",
      allowedHostsAndRoutes: ["example.test/api"],
      actionClass: "read-only",
      accountOrSessionUse: "none",
      browserReconAllowed: "yes",
      liveReplayAllowed: "no",
      requestBudget: { total: 3, remaining: 3, minDelayMs: 500, concurrency: 1 },
    },
  });
}

function awaitableDraft(sessionID) {
  return {
    version: 1,
    kind: "reverse-session",
    sessionID,
    status: "draft",
    phase: "discover",
    ownerSkill: null,
    engine: "none",
    engineLifecycle: "inactive",
    scope: { authorizationBasis: "unknown", allowedHostsAndRoutes: [], actionClass: "other", accountOrSessionUse: "unknown", browserReconAllowed: "unknown", liveReplayAllowed: "unknown", requestBudget: null },
    sourceIds: [], obligations: [], confirmations: [],
  };
}

test("draft sessions block browser reverse tools until configured", () => {
  const result = evaluateToolCall({ state: awaitableDraft("draft"), isChild: false, toolName: "camoufox-reverse-mcp_navigate" });
  assert.equal(result.allow, false);
});

test("an engine lease permits only its active engine", () => {
  const state = configuredState();
  assert.equal(evaluateToolCall({ state, isChild: false, toolName: "camoufox-reverse-mcp_navigate" }).allow, true);
  assert.equal(evaluateToolCall({ state, isChild: false, toolName: "firefox-reverse-ai-mcp_agent_start" }).allow, false);
});

test("child sessions cannot use browser reverse tools", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-control-"));
  try {
    await saveState(configuredState(), root);
    await registerChildSession("child", "parent", root);
    const effective = await loadEffectiveState("child", root);
    assert.equal(effective.isChild, true);
    assert.equal(evaluateToolCall({ ...effective, toolName: "camoufox-reverse-mcp_navigate" }).allow, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("full transitions are monotonic and sidecars preserve phase", () => {
  const state = configuredState();
  assert.equal(transition(state, "full", "local-runtime", "env-patch").phase, "local-runtime");
  assert.throws(() => transition(state, "full", "discover", "camoufox-js-reverse"));
  assert.equal(transition(state, "sidecar", "discover", null).phase, "discover");
});

test("source invalidation marks live ids stale", () => {
  const state = recordSource(configuredState(), { kind: "request", id: "r1", status: "live" });
  assert.equal(markSourcesStale(state).sourceIds[0].status, "stale");
});

test("state storage rejects secret-shaped fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-control-"));
  try {
    const state = { ...awaitableDraft("secret"), token: "must-not-write" };
    await assert.rejects(() => saveState(state, root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("handoff validation rejects missing schema fields and scope expansion", () => {
  assert.ok(validateHandoff({}).length > 0);
  const state = configuredState();
  const packet = {
    schemaVersion: "reverse-handoff/v1", handoffId: "h", handoffRevision: 1, handoffKind: "full", handoffStatus: "ready",
    sourceSkill: "camoufox-js-reverse", targetSkill: "env-patch", ownerSkill: "camoufox-js-reverse", ownerPhase: "discover", nextPhase: "local-runtime",
    authorizationBasis: "public-unauthenticated", allowedHostsAndRoutes: ["outside.test/api"], actionClass: "read-only", accountOrSessionUse: "none",
    requestBudget: { total: 3, remaining: 3, minDelayMs: 500, concurrency: 1 }, browserReconAllowed: "yes", liveReplayAllowed: "no",
    artifactRetention: { mode: "metadata-only", approvedRawFields: [], paths: [], retainUntil: null, purgeOwner: null }, projectRoot: null, targetLandingRoot: null, rootMode: "no-write",
    engineProvenance: [], sourceIds: [], targetPageUrl: null, targetApiUrl: null, knownFields: [], requestSamples: [], fixedInputOutput: [], availableRuntimeArtifacts: [], cookieArtifacts: [], missingEvidence: [], acceptanceTest: "test",
  };
  assert.ok(validateHandoff(packet, state).some((error) => error.includes("expands")));
});

test("a parked engine is required before a switch", () => {
  assert.throws(() => switchEngine(configuredState(), "js-reverse"));
});

test("an active scope cannot change authorization, action class, or account policy", () => {
  const state = configuredState();
  assert.throws(() => configure(state, { scope: { ...state.scope, actionClass: "mutation" } }));
  assert.throws(() => configure(state, { scope: { ...state.scope, accountOrSessionUse: "approved-account-bound" } }));
});

test("the plugin enforces an engine lease and stales sources after navigation", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-control-plugin-"));
  const prior = process.env.LOCALAPPDATA;
  process.env.LOCALAPPDATA = root;
  try {
    const hooks = await reverseControlPlugin();
    const context = { sessionID: `plugin-${randomUUID()}`, directory: "C:/project", ask: async () => {} };
    await hooks.tool.reverse_control.execute({
      action: "configure",
      fields: JSON.stringify({
        engine: "camoufox",
        ownerSkill: "camoufox-js-reverse",
        scope: configuredState().scope,
      }),
    }, context);
    await hooks.tool.reverse_control.execute({ action: "record", kind: "source", id: "request-1", fields: "{\"kind\":\"request\"}" }, context);
    await assert.rejects(() => hooks["tool.execute.before"]({ tool: "firefox-reverse-ai-mcp_agent_start", sessionID: context.sessionID }));
    await hooks["tool.execute.after"]({ tool: "camoufox-reverse-mcp_navigate", sessionID: context.sessionID });
    const status = JSON.parse(await hooks.tool.reverse_control.execute({ action: "status" }, context));
    assert.equal(status.state.sourceIds[0].status, "stale");
  } finally {
    if (prior === undefined) delete process.env.LOCALAPPDATA;
    else process.env.LOCALAPPDATA = prior;
    await rm(root, { recursive: true, force: true });
  }
});

test("ensureDraft is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "reverse-control-"));
  try {
    await ensureDraft("one", "C:/project", root);
    const second = await ensureDraft("one", "C:/other", root);
    assert.equal(second.projectRoot, "C:/project");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
