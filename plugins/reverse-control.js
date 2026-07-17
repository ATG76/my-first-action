import { tool } from "@opencode-ai/plugin";
import {
  checkpoint,
  closeSession,
  formatTaskBrief,
  markSourcesStale,
  recordConfirmation,
  recordEngineLifecycle,
  recordSource,
  startSession,
  switchEngine,
} from "../reverse-control/controller.mjs";
import { evaluateToolCall, isBrowserReverseTool, isLifecycleResetTool } from "../reverse-control/policy.mjs";
import { ensureDraft, loadEffectiveState, registerChildSession, saveState } from "../reverse-control/state-store.mjs";

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

export default async function reverseControlPlugin() {
  return {
    tool: {
      reverse_control: tool({
        description: "Maintain a compact personal reverse-assistant task brief. Use start after choosing an owner skill and engine, checkpoint after meaningful evidence or a direction change, and close when pausing. Never place raw cookies, tokens, headers, or bodies in its arguments.",
        args: {
          action: tool.schema.enum(["start", "status", "checkpoint", "record", "switch-engine", "confirm", "close"]),
          fields: tool.schema.string().optional(),
          kind: tool.schema.string().optional(),
          id: tool.schema.string().optional(),
          engine: tool.schema.string().optional(),
          lifecycle: tool.schema.string().optional(),
          status: tool.schema.string().optional(),
          topic: tool.schema.string().optional(),
          note: tool.schema.string().optional(),
        },
        async execute(args, context) {
          if (args.action === "status") {
            const effective = await loadEffectiveState(context.sessionID);
            return JSON.stringify(effective, null, 2);
          }

          if (args.action === "start") {
            const fields = parseObject(args.fields || "{}", "fields");
            const state = await save(context.sessionID, context.directory, (current) => startSession(current, fields));
            return JSON.stringify({ status: state.status, ownerSkill: state.ownerSkill, engine: state.engine, brief: state.brief }, null, 2);
          }

          if (args.action === "checkpoint") {
            const fields = parseObject(args.fields || "{}", "fields");
            const state = await save(context.sessionID, context.directory, (current) => checkpoint(current, fields));
            return JSON.stringify({ status: state.status, ownerSkill: state.ownerSkill, engine: state.engine, brief: state.brief }, null, 2);
          }

          if (args.action === "record") {
            const fields = parseObject(args.fields || "{}", "fields");
            const state = await save(context.sessionID, context.directory, (current) => {
              if (args.kind === "source") return recordSource(current, { ...fields, id: args.id || fields.id, engine: args.engine || fields.engine, lifecycle: args.lifecycle || fields.lifecycle, status: args.status || fields.status });
              if (args.kind === "engine") return recordEngineLifecycle(current, args.lifecycle || fields.lifecycle);
              throw new Error("record kind must be source or engine.");
            });
            return JSON.stringify({ engine: state.engine, engineLifecycle: state.engineLifecycle, sourceIds: state.sourceIds }, null, 2);
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
            return JSON.stringify({ closed: true, status: state.status, warnings: result.warnings, liveSources: result.liveSources }, null, 2);
          }

          throw new Error(`Unsupported reverse_control action: ${args.action}`);
        },
      }),
    },
    event: async ({ event }) => {
      if (event.type !== "session.created") return;
      const info = event.properties.info;
      if (!info.parentID) return;
      await registerChildSession(info.id, info.parentID);
    },
    "command.execute.before": async (input) => {
      if (input.command === "reverse-start") await ensureDraft(input.sessionID);
    },
    "tool.execute.before": async (input, output) => {
      if (!isBrowserReverseTool(input.tool)) return;
      const effective = await loadEffectiveState(input.sessionID);
      const decision = evaluateToolCall({ ...effective, toolName: input.tool, toolArgs: output.args || {} });
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
    "experimental.session.compacting": async (input, output) => {
      const effective = await loadEffectiveState(input.sessionID);
      if (!effective.state || effective.isChild || effective.state.status !== "active") return;
      output.context.push(formatTaskBrief(effective.state));
    },
  };
}
