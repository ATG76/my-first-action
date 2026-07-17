import { tool } from "@opencode-ai/plugin";
import {
  closeSession,
  configure,
  markSourcesStale,
  recordConfirmation,
  recordEngineLifecycle,
  recordObligation,
  recordSource,
  switchEngine,
  transition,
} from "../reverse-control/controller.mjs";
import { validateHandoff } from "../reverse-control/handoff-schema.mjs";
import { evaluateToolCall, isBrowserReverseTool, isLifecycleResetTool } from "../reverse-control/policy.mjs";
import { ensureDraft, loadEffectiveState, loadState, registerChildSession, saveState } from "../reverse-control/state-store.mjs";

function parseObject(value, label) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    return parsed;
  } catch {
    throw new Error(`${label} must be a JSON object.`);
  }
}

async function sessionState(sessionID, directory) {
  return ensureDraft(sessionID, directory);
}

async function save(sessionID, directory, update) {
  const current = await sessionState(sessionID, directory);
  return saveState(update(current));
}

function requiresConfirmation(fields) {
  const scope = fields.scope || {};
  return scope.accountOrSessionUse && scope.accountOrSessionUse !== "none"
    || scope.actionClass && scope.actionClass !== "read-only"
    || scope.liveReplayAllowed === "yes";
}

export default async function reverseControlPlugin() {
  return {
    tool: {
      reverse_control: tool({
        description: "Maintain a session-scoped reverse-engineering control ledger. Use it before browser tools, before phase handoffs, and before closing a reverse task. Never place raw cookies, tokens, headers, or bodies in its arguments.",
        args: {
          action: tool.schema.enum(["configure", "status", "record", "transition", "validate-handoff", "switch-engine", "confirm", "close"]),
          fields: tool.schema.string().optional(),
          kind: tool.schema.string().optional(),
          id: tool.schema.string().optional(),
          engine: tool.schema.string().optional(),
          lifecycle: tool.schema.string().optional(),
          status: tool.schema.string().optional(),
          handoffKind: tool.schema.string().optional(),
          nextPhase: tool.schema.string().optional(),
          ownerSkill: tool.schema.string().optional(),
          packet: tool.schema.string().optional(),
          topic: tool.schema.string().optional(),
          note: tool.schema.string().optional(),
        },
        async execute(args, context) {
          if (args.action === "status") {
            const effective = await loadEffectiveState(context.sessionID);
            return JSON.stringify(effective, null, 2);
          }

          if (args.action === "configure") {
            const fields = parseObject(args.fields || "{}", "fields");
            if (requiresConfirmation(fields)) {
              await context.ask({
                permission: "reverse-control:scope",
                patterns: ["reverse-control:scope"],
                always: ["reverse-control:scope"],
                metadata: { reason: "The reverse scope includes account/session use, mutation, or live replay." },
              });
            }
            const state = await save(context.sessionID, context.directory, (current) => configure(current, fields));
            return JSON.stringify({ status: state.status, phase: state.phase, engine: state.engine, scope: state.scope }, null, 2);
          }

          if (args.action === "record") {
            const fields = parseObject(args.fields || "{}", "fields");
            const state = await save(context.sessionID, context.directory, (current) => {
              if (args.kind === "source") return recordSource(current, { ...fields, id: args.id || fields.id, engine: args.engine || fields.engine, lifecycle: args.lifecycle || fields.lifecycle, status: args.status || fields.status });
              if (args.kind === "engine") return recordEngineLifecycle(current, args.lifecycle || fields.lifecycle);
              if (args.kind === "obligation") return recordObligation(current, { ...fields, name: args.id || fields.name, engine: args.engine || fields.engine, status: args.status || fields.status });
              throw new Error("record kind must be source, engine, or obligation.");
            });
            return JSON.stringify({ phase: state.phase, engine: state.engine, engineLifecycle: state.engineLifecycle, sourceIds: state.sourceIds, obligations: state.obligations }, null, 2);
          }

          if (args.action === "transition") {
            const state = await save(context.sessionID, context.directory, (current) => transition(current, args.handoffKind, args.nextPhase, args.ownerSkill));
            return JSON.stringify({ phase: state.phase, ownerSkill: state.ownerSkill }, null, 2);
          }

          if (args.action === "validate-handoff") {
            const packet = parseObject(args.packet || "", "packet");
            const current = await sessionState(context.sessionID, context.directory);
            const errors = validateHandoff(packet, current);
            return JSON.stringify({ valid: errors.length === 0, errors }, null, 2);
          }

          if (args.action === "switch-engine") {
            const state = await save(context.sessionID, context.directory, (current) => switchEngine(current, args.engine));
            return JSON.stringify({ engine: state.engine, engineLifecycle: state.engineLifecycle }, null, 2);
          }

          if (args.action === "confirm") {
            await context.ask({
              permission: `reverse-control:${args.topic || "confirmation"}`,
              patterns: [`reverse-control:${args.topic || "confirmation"}`],
              always: [],
              metadata: { reason: args.note || "Reverse-control confirmation requested." },
            });
            const state = await save(context.sessionID, context.directory, (current) => recordConfirmation(current, args.topic, args.note));
            return JSON.stringify({ confirmations: state.confirmations }, null, 2);
          }

          if (args.action === "close") {
            const current = await sessionState(context.sessionID, context.directory);
            const result = closeSession(current);
            const state = await saveState(result.state);
            return JSON.stringify({ status: state.status, openObligations: result.openObligations, liveSources: result.liveSources }, null, 2);
          }

          throw new Error(`Unsupported reverse_control action: ${args.action}`);
        },
      }),
    },
    event: async ({ event }) => {
      if (event.type !== "session.created") return;
      const info = event.properties.info;
      if (!info.parentID) return;
      if (await loadState(info.parentID)) await registerChildSession(info.id, info.parentID);
    },
    "command.execute.before": async (input) => {
      if (input.command === "reverse-start") await ensureDraft(input.sessionID);
    },
    "tool.execute.before": async (input) => {
      if (!isBrowserReverseTool(input.tool)) return;
      const effective = await loadEffectiveState(input.sessionID);
      const decision = evaluateToolCall({ ...effective, toolName: input.tool });
      if (!decision.allow) throw new Error(`Reverse Control: ${decision.reason}`);
    },
    "tool.execute.after": async (input) => {
      if (!isBrowserReverseTool(input.tool)) return;
      const effective = await loadEffectiveState(input.sessionID);
      if (!effective.state || effective.isChild) return;

      let next = effective.state;
      if (isLifecycleResetTool(input.tool)) next = markSourcesStale(next);
      if (input.tool.endsWith("close_browser")) next = recordEngineLifecycle(next, "closed");
      if (next !== effective.state) await saveState(next);
    },
  };
}
