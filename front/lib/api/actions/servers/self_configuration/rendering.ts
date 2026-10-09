import {
  ADJUST_REASONING_EFFORT_SCHEMA,
  ADJUST_REASONING_EFFORT_TOOL_NAME,
  SELF_CONFIGURATION_SERVER_NAME,
} from "@app/lib/api/actions/servers/self_configuration/metadata";
import type { AgentMCPActionType } from "@app/types/actions";
import type { ReasoningEffortChange } from "@app/types/assistant/models/reasoning";
import { z } from "zod";

const AdjustReasoningEffortParamsSchema = z.object(
  ADJUST_REASONING_EFFORT_SCHEMA
);

/**
 * @cc [owner:aubin-tchoi,label:product;performance] effort-change-from-action-metadata
 * Returns the change of a succeeded `adjust_reasoning_effort` action, or null for any other
 * action. It MUST only read the action's metadata and params, never its output: tool outputs of
 * older interactions are not loaded on later renders, so an output-based raise would vanish from
 * history, silently reverting the effort and changing the cached prefix.
 */
export function getEffortChange(
  action: AgentMCPActionType
): ReasoningEffortChange | null {
  if (
    action.internalMCPServerName !== SELF_CONFIGURATION_SERVER_NAME ||
    action.toolName !== ADJUST_REASONING_EFFORT_TOOL_NAME ||
    action.status !== "succeeded"
  ) {
    return null;
  }

  const params = AdjustReasoningEffortParamsSchema.safeParse(action.params);

  return params.success
    ? { direction: params.data.direction, steps: params.data.steps ?? 1 }
    : null;
}
