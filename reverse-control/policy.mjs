export const PHASES = ["discover", "structure", "local-runtime", "compact-replay", "protocol-delivery"];
export const ENGINES = ["none", "camoufox", "firefox-reverse", "wechat-miniapp", "chrome", "js-reverse", "cloakbrowser", "node-vm", "iv8", "offline"];

const ENGINE_PREFIXES = [
  ["camoufox-reverse-mcp_", "camoufox"],
  ["firefox-reverse-ai-mcp_", "firefox-reverse"],
  ["miniapp-reverse_", "wechat-miniapp"],
  ["chrome-devtools_", "chrome"],
  ["js-reverse_", "js-reverse"],
];

export function engineForTool(toolName) {
  return ENGINE_PREFIXES.find(([prefix]) => toolName.startsWith(prefix))?.[1] || null;
}

export function isBrowserReverseTool(toolName) {
  return engineForTool(toolName) !== null;
}

export function evaluateToolCall({ state, isChild, toolName }) {
  const requestedEngine = engineForTool(toolName);
  if (!requestedEngine || !state) return { allow: true };
  if (isChild) return { allow: false, reason: "Browser reverse tools are disabled in child sessions." };
  if (state.status === "closed") return { allow: false, reason: "Reverse session is closed. Start a new session before browser work." };
  if (state.status === "draft") return { allow: false, reason: "Reverse session is a draft. Configure its scope and engine first." };
  if (state.engine !== requestedEngine) {
    return { allow: false, reason: `Engine lease is ${state.engine}; ${requestedEngine} is not active.` };
  }
  if (state.engineLifecycle !== "active") {
    return { allow: false, reason: `Engine lease is ${state.engineLifecycle}; record an explicit engine switch before using it.` };
  }
  return { allow: true };
}

export function assertForwardTransition(currentPhase, nextPhase, handoffKind) {
  const current = PHASES.indexOf(currentPhase);
  const next = PHASES.indexOf(nextPhase);
  if (next < 0) throw new Error(`Unknown reverse phase: ${nextPhase}`);
  if (handoffKind === "sidecar") {
    if (current !== next) throw new Error("A sidecar handoff cannot change phase ownership.");
    return;
  }
  if (handoffKind !== "full") throw new Error(`Unsupported handoff kind: ${handoffKind}`);
  if (next <= current) throw new Error("A full handoff must move forward to a later phase.");
}

function isSubset(next, current) {
  return next.every((item) => current.includes(item));
}

export function assertScopeDoesNotWiden(current, next) {
  if (current.allowedHostsAndRoutes.length && !isSubset(next.allowedHostsAndRoutes, current.allowedHostsAndRoutes)) {
    throw new Error("allowedHostsAndRoutes cannot expand after reverse work has started.");
  }
  if (current.browserReconAllowed === "no" && next.browserReconAllowed === "yes") {
    throw new Error("browserReconAllowed cannot expand from no to yes.");
  }
  if (current.liveReplayAllowed === "no" && next.liveReplayAllowed === "yes") {
    throw new Error("liveReplayAllowed cannot expand from no to yes.");
  }
  for (const field of ["authorizationBasis", "actionClass", "accountOrSessionUse"]) {
    if (current[field] !== "unknown" && current[field] !== next[field]) {
      throw new Error(`${field} cannot change after reverse work has started.`);
    }
  }
  if (current.requestBudget && next.requestBudget) {
    if (next.requestBudget.total > current.requestBudget.total || next.requestBudget.remaining > current.requestBudget.remaining) {
      throw new Error("requestBudget cannot increase after reverse work has started.");
    }
  }
}

export function isLifecycleResetTool(toolName) {
  return /(?:navigate|reload|select_page|select_frame|switch_target|import_state|reset_browser_state|close_browser)/.test(toolName);
}
