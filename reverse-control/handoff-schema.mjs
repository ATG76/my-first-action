import { PHASES } from "./policy.mjs";

const REQUIRED = [
  "schemaVersion", "handoffId", "handoffRevision", "handoffKind", "handoffStatus", "sourceSkill", "targetSkill",
  "ownerSkill", "ownerPhase", "nextPhase", "authorizationBasis", "allowedHostsAndRoutes", "actionClass",
  "accountOrSessionUse", "requestBudget", "browserReconAllowed", "liveReplayAllowed", "artifactRetention",
  "projectRoot", "targetLandingRoot", "rootMode", "engineProvenance", "sourceIds", "targetPageUrl", "targetApiUrl",
  "knownFields", "requestSamples", "fixedInputOutput", "availableRuntimeArtifacts", "cookieArtifacts", "missingEvidence", "acceptanceTest",
];

export function validateHandoff(packet, currentState = null) {
  const errors = [];
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return ["Handoff packet must be a JSON object."];
  for (const field of REQUIRED) if (!(field in packet)) errors.push(`Missing required field: ${field}`);
  if (packet.schemaVersion !== "reverse-handoff/v1") errors.push("schemaVersion must be reverse-handoff/v1.");
  if (!PHASES.includes(packet.ownerPhase)) errors.push("ownerPhase is invalid.");
  if (!PHASES.includes(packet.nextPhase)) errors.push("nextPhase is invalid.");
  if (!Array.isArray(packet.allowedHostsAndRoutes)) errors.push("allowedHostsAndRoutes must be an array.");
  if (!Array.isArray(packet.sourceIds)) errors.push("sourceIds must be an array.");
  if (!packet.requestBudget || typeof packet.requestBudget !== "object") errors.push("requestBudget is required.");
  if (packet.artifactRetention?.mode === "raw-approved") {
    if (!Array.isArray(packet.artifactRetention.approvedRawFields) || !packet.artifactRetention.approvedRawFields.length) {
      errors.push("raw-approved retention requires approvedRawFields.");
    }
    if (!packet.artifactRetention.retainUntil || !packet.artifactRetention.purgeOwner) {
      errors.push("raw-approved retention requires retainUntil and purgeOwner.");
    }
  }
  if (currentState?.scope) {
    const prior = currentState.scope;
    if (prior.allowedHostsAndRoutes.length && packet.allowedHostsAndRoutes.some((route) => !prior.allowedHostsAndRoutes.includes(route))) {
      errors.push("Handoff expands allowedHostsAndRoutes.");
    }
    if (prior.requestBudget && packet.requestBudget && packet.requestBudget.remaining > prior.requestBudget.remaining) {
      errors.push("Handoff increases requestBudget.remaining.");
    }
  }
  return errors;
}
