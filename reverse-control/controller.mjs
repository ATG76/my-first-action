import { assertForwardTransition, assertScopeDoesNotWiden, ENGINES } from "./policy.mjs";

const ACTIVE_LIFECYCLE = "active";

export function configure(state, fields) {
  if (state.status === "closed") throw new Error("A closed reverse session cannot be reconfigured.");
  const scope = { ...state.scope, ...(fields.scope || {}) };
  if (!Array.isArray(scope.allowedHostsAndRoutes)) throw new Error("scope.allowedHostsAndRoutes must be an array.");
  if (state.status === "active") assertScopeDoesNotWiden(state.scope, scope);
  const engine = fields.engine ?? state.engine;
  if (!ENGINES.includes(engine)) throw new Error(`Unknown reverse engine: ${engine}`);
  if (state.status !== "draft" && engine !== state.engine) {
    throw new Error("Use switch-engine after activation; configure cannot replace an active engine lease.");
  }

  const active = engine !== "none" && scope.authorizationBasis !== "unknown" && scope.allowedHostsAndRoutes.length > 0;
  return {
    ...state,
    status: active ? "active" : "draft",
    ownerSkill: fields.ownerSkill ?? state.ownerSkill,
    engine,
    engineLifecycle: active ? ACTIVE_LIFECYCLE : "inactive",
    scope,
  };
}

export function switchEngine(state, engine) {
  if (state.status !== "active") throw new Error("Only an active reverse session can switch engines.");
  if (!ENGINES.includes(engine) || engine === "none") throw new Error("switch-engine requires a concrete engine.");
  if (state.engineLifecycle === "active") {
    throw new Error("Record the current engine as parked or closed before switching engines.");
  }
  if (state.engine === "chrome" && engine === "js-reverse" && state.engineLifecycle !== "parked") {
    throw new Error("Chrome must be recorded as parked before switching to js-reverse.");
  }
  if (state.engine === "js-reverse" && engine === "chrome" && state.engineLifecycle !== "closed") {
    throw new Error("js-reverse must be recorded as closed before returning to Chrome.");
  }
  return { ...state, engine, engineLifecycle: ACTIVE_LIFECYCLE };
}

export function transition(state, handoffKind, nextPhase, ownerSkill) {
  assertForwardTransition(state.phase, nextPhase, handoffKind);
  return handoffKind === "sidecar"
    ? state
    : { ...state, phase: nextPhase, ownerSkill: ownerSkill || state.ownerSkill };
}

export function recordSource(state, source) {
  if (!source.id || !source.kind) throw new Error("record requires source kind and id.");
  const sourceIds = state.sourceIds.filter((item) => !(item.kind === source.kind && item.id === source.id));
  sourceIds.push({
    kind: source.kind,
    id: source.id,
    engine: source.engine || state.engine,
    mcpServer: source.mcpServer || null,
    lifecycle: source.lifecycle || "unknown",
    status: source.status || "live",
    capturedAt: new Date().toISOString(),
  });
  return { ...state, sourceIds };
}

export function markSourcesStale(state, engine = state.engine) {
  return {
    ...state,
    sourceIds: state.sourceIds.map((source) => source.engine === engine && source.status === "live" ? { ...source, status: "stale" } : source),
  };
}

export function recordEngineLifecycle(state, lifecycle) {
  if (!['inactive', 'active', 'parked', 'closed'].includes(lifecycle)) throw new Error(`Unknown engine lifecycle: ${lifecycle}`);
  return lifecycle === "closed" ? { ...markSourcesStale(state), engineLifecycle: lifecycle } : { ...state, engineLifecycle: lifecycle };
}

export function recordObligation(state, obligation) {
  if (!obligation.name) throw new Error("An obligation needs a name.");
  const obligations = state.obligations.filter((item) => item.name !== obligation.name);
  obligations.push({ name: obligation.name, status: obligation.status || "open", engine: obligation.engine || state.engine });
  return { ...state, obligations };
}

export function recordConfirmation(state, topic, note) {
  if (!topic) throw new Error("A confirmation topic is required.");
  return { ...state, confirmations: [...state.confirmations, { topic, note: note || null, at: new Date().toISOString() }] };
}

export function closeSession(state) {
  const openObligations = state.obligations.filter((item) => item.status !== "cleared");
  const liveSources = state.sourceIds.filter((item) => item.status === "live");
  return { state: { ...state, status: "closed", engineLifecycle: "closed" }, openObligations, liveSources };
}
