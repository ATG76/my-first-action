import { ENGINES } from "./policy.mjs";

const ACTIVE_LIFECYCLE = "active";
const SOURCE_KINDS = ["request", "script", "frame", "target", "websocket", "trace", "session", "worker"];
const SOURCE_STATUSES = ["live", "stale", "artifact-only"];

function optionalText(value, field) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string when provided.`);
  return value.trim();
}

function textList(value, field) {
  if (value == null) return [];
  const entries = Array.isArray(value) ? value : [value];
  if (entries.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${field} must contain non-empty strings.`);
  }
  return entries.map((entry) => entry.trim());
}

function briefFrom(fields) {
  const goal = optionalText(fields.goal, "goal");
  if (!goal) throw new Error("goal is required to start a reverse session.");
  return {
    goal,
    deliverable: optionalText(fields.deliverable, "deliverable"),
    provided: textList(fields.provided, "provided"),
    verified: textList(fields.verified, "verified"),
    hypotheses: textList(fields.hypotheses, "hypotheses"),
    nextEvidence: optionalText(fields.nextEvidence, "nextEvidence"),
    acceptance: optionalText(fields.acceptance, "acceptance"),
  };
}

export function startSession(state, fields) {
  if (state.status === "closed") throw new Error("A closed reverse session cannot be restarted.");
  if (state.status === "active") throw new Error("Reverse session is already active. Use checkpoint or switch-engine instead.");
  const engine = fields.engine;
  if (!ENGINES.includes(engine) || engine === "none") throw new Error(`A concrete reverse engine is required: ${engine}`);
  const ownerSkill = optionalText(fields.ownerSkill, "ownerSkill");
  if (!ownerSkill) throw new Error("ownerSkill is required to start a reverse session.");
  return {
    ...state,
    status: "active",
    ownerSkill,
    engine,
    engineLifecycle: ACTIVE_LIFECYCLE,
    brief: briefFrom(fields),
  };
}

export function checkpoint(state, fields) {
  if (state.status !== "active") throw new Error("Only an active reverse session can record a checkpoint.");
  const current = state.brief || {};
  const next = { ...current };
  for (const field of ["goal", "deliverable", "nextEvidence", "acceptance"]) {
    if (field in fields) next[field] = optionalText(fields[field], field);
  }
  for (const field of ["provided", "verified", "hypotheses"]) {
    if (field in fields) next[field] = textList(fields[field], field);
  }
  const ownerSkill = "ownerSkill" in fields ? optionalText(fields.ownerSkill, "ownerSkill") : state.ownerSkill;
  if (!ownerSkill) throw new Error("ownerSkill cannot be empty for an active reverse session.");
  return { ...state, ownerSkill, brief: next };
}

export function switchEngine(state, engine) {
  if (state.status !== "active") throw new Error("Only an active reverse session can switch engines.");
  if (!ENGINES.includes(engine) || engine === "none") throw new Error("switch-engine requires a concrete engine.");
  if (engine === state.engine) {
    return state.engineLifecycle === "active" ? state : { ...state, engineLifecycle: ACTIVE_LIFECYCLE };
  }
  if (state.engineLifecycle === "active") {
    throw new Error("Close or park the current engine before switching engines.");
  }
  return { ...state, engine, engineLifecycle: ACTIVE_LIFECYCLE };
}

export function recordSource(state, source) {
  if (!source.id || !source.kind) throw new Error("record requires source kind and id.");
  if (!SOURCE_KINDS.includes(source.kind)) throw new Error(`Unknown source kind: ${source.kind}`);
  if (source.status && !SOURCE_STATUSES.includes(source.status)) throw new Error(`Unknown source status: ${source.status}`);
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

export function recordConfirmation(state, topic, note) {
  if (!topic) throw new Error("A confirmation topic is required.");
  return { ...state, confirmations: [...state.confirmations, { topic, note: note || null, at: new Date().toISOString() }] };
}

export function closeSession(state) {
  const liveSources = state.sourceIds.filter((item) => item.status === "live");
  const warnings = [];
  if (state.engineLifecycle === "active") warnings.push("The active engine was not explicitly closed or parked.");
  if (liveSources.length) warnings.push(`${liveSources.length} live source reference(s) were still recorded.`);
  return {
    state: { ...markSourcesStale(state), status: "closed", engineLifecycle: "closed" },
    warnings,
    liveSources,
  };
}

function formatList(label, entries) {
  return entries?.length ? `${label}: ${entries.map((entry) => `- ${entry}`).join(" ")}` : null;
}

export function formatTaskBrief(state) {
  const brief = state.brief || {};
  const lines = [
    "## Reverse task checkpoint",
    `Goal: ${brief.goal || "not recorded"}`,
    `Owner skill: ${state.ownerSkill || "not selected"}`,
    `Engine: ${state.engine || "not selected"}`,
  ];
  if (brief.deliverable) lines.push(`Deliverable: ${brief.deliverable}`);
  for (const line of [
    formatList("User-provided details (unverified)", brief.provided),
    formatList("Verified evidence", brief.verified),
    formatList("Working hypotheses", brief.hypotheses),
  ]) {
    if (line) lines.push(line);
  }
  if (brief.nextEvidence) lines.push(`Next evidence: ${brief.nextEvidence}`);
  if (brief.acceptance) lines.push(`Acceptance: ${brief.acceptance}`);
  lines.push("Treat user-provided details and hypotheses as unverified until evidence is recorded. Continue with the next evidence only.");
  return lines.join("\n");
}
