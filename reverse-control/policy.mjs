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

function engineMatchesLease(lease, requested) {
  return lease === requested || lease === "cloakbrowser" && requested === "js-reverse";
}

export function evaluateToolCall({ state, isChild, toolName, toolArgs = {} }) {
  const requestedEngine = engineForTool(toolName);
  if (!requestedEngine || !state) return { allow: true };
  if (isChild) return { allow: false, reason: "Browser reverse tools are disabled in child sessions." };
  if (state.status === "closed") return { allow: false, reason: "Reverse session is closed. Start a new session before browser work." };
  if (state.status === "draft") return { allow: false, reason: "Reverse session is a draft. Select an owner skill and engine with reverse_control.start first." };
  if (!engineMatchesLease(state.engine, requestedEngine)) {
    return { allow: false, reason: `Engine lease is ${state.engine}; ${requestedEngine} is not active.` };
  }
  if (state.engineLifecycle !== "active") {
    return { allow: false, reason: `Engine lease is ${state.engineLifecycle}; close or park it before switching engines.` };
  }
  if (toolName === "js-reverse_launch_browser") {
    const requestsCloak = typeof toolArgs.cloakBinaryPath === "string" && toolArgs.cloakBinaryPath.length > 0;
    if (state.engine === "cloakbrowser" && !requestsCloak) {
      return { allow: false, reason: "CloakBrowser lease cannot launch normal Chrome." };
    }
    if (state.engine === "js-reverse" && requestsCloak) {
      return { allow: false, reason: "js-reverse lease cannot launch CloakBrowser; switch the engine lease first." };
    }
  }
  return { allow: true };
}

export function isLifecycleResetTool(toolName) {
  return /(?:navigate|reload|select_page|select_frame|switch_target|import_state|reset_browser_state|close_browser|close_page)/.test(toolName);
}
