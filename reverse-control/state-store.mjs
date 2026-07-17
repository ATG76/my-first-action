import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const SECRET_KEY = /(?:authorization|cookie|token|password|secret|api[_-]?key|raw(?:body)?|requestbody|responsebody)/i;

export function defaultStateRoot() {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return join(localAppData, "OpenCode", "reverse-control", "sessions");
}

function statePath(sessionID, root) {
  return join(root || defaultStateRoot(), `${sessionID}.json`);
}

function assertNoSensitiveKeys(value, path = "") {
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key !== "authorizationBasis" && SECRET_KEY.test(key)) {
      throw new Error(`Reverse control state cannot persist sensitive field: ${childPath}`);
    }
    assertNoSensitiveKeys(child, childPath);
  }
}

export function newDraftState(sessionID, projectRoot = null) {
  const now = new Date().toISOString();
  return {
    version: 1,
    kind: "reverse-session",
    sessionID,
    projectRoot,
    status: "draft",
    phase: "discover",
    ownerSkill: null,
    engine: "none",
    engineLifecycle: "inactive",
    scope: {
      authorizationBasis: "unknown",
      allowedHostsAndRoutes: [],
      actionClass: "other",
      accountOrSessionUse: "unknown",
      browserReconAllowed: "unknown",
      liveReplayAllowed: "unknown",
      requestBudget: null,
    },
    sourceIds: [],
    obligations: [],
    confirmations: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function loadState(sessionID, root) {
  try {
    return JSON.parse(await readFile(statePath(sessionID, root), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function saveState(state, root) {
  assertNoSensitiveKeys(state);
  const file = statePath(state.sessionID, root);
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const next = { ...state, updatedAt: new Date().toISOString() };

  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }

  return next;
}

export async function ensureDraft(sessionID, projectRoot, root) {
  const current = await loadState(sessionID, root);
  if (current) return current;
  return saveState(newDraftState(sessionID, projectRoot), root);
}

export async function registerChildSession(sessionID, parentSessionID, root) {
  const now = new Date().toISOString();
  return saveState(
    {
      version: 1,
      kind: "reverse-child-link",
      sessionID,
      parentSessionID,
      createdAt: now,
      updatedAt: now,
    },
    root,
  );
}

export async function loadEffectiveState(sessionID, root) {
  const current = await loadState(sessionID, root);
  if (!current) return { state: null, isChild: false };
  if (current.kind !== "reverse-child-link") return { state: current, isChild: false };

  const parent = await loadState(current.parentSessionID, root);
  return { state: parent, isChild: Boolean(parent) };
}
