import type { ModelId } from "@app/types/shared/model_id";

export const CONSUMPTION_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CONSUMPTION_ROOT_TOTAL_FIELD = "total_micro_credits";
export const CONSUMPTION_ROOT_SUBAGENTS_FIELD = "subagents";

/**
 * @cc [owner:id13,label:backend;compatibility] consumption-root-key
 * Calls for the same workspace and root agent message MUST return the same Redis key, and calls for
 * different workspaces or root agent messages MUST return different keys.
 */
export function makeConsumptionRootKey({
  workspaceId,
  rootAgentMessageId,
}: {
  workspaceId: string;
  rootAgentMessageId: ModelId;
}): string {
  return `consumption:root:${workspaceId}:${rootAgentMessageId}`;
}

/**
 * @cc [owner:id13,label:backend;compatibility] consumption-agent-message-field
 * Each agent message MUST map to one stable field within its root hash.
 */
export function makeConsumptionRootAgentMessageField(
  agentMessageId: ModelId
): string {
  return `m:${agentMessageId}`;
}

export function makeConsumptionRootSubagentField(
  agentMessageId: ModelId
): string {
  return `a:${agentMessageId}`;
}
