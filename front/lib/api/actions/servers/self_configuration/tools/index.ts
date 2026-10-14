import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { moveReasoningEffort } from "@app/lib/api/actions/servers/self_configuration/helpers";
import {
  ADJUST_REASONING_EFFORT_TOOL_NAME,
  SELF_CONFIGURATION_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/self_configuration/metadata";
import { makeReasoningEffortChangeOutput } from "@app/lib/api/actions/servers/self_configuration/rendering";
import { supportsPerMessageReasoningEffort } from "@app/lib/api/llm/per_message_reasoning_effort";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const handlers: ToolHandlers<typeof SELF_CONFIGURATION_TOOLS_METADATA> = {
  [ADJUST_REASONING_EFFORT_TOOL_NAME]: async (
    { direction, steps = 1 },
    { runContext }
  ) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const { modelInfo, stepContext } = runContext;
    const from =
      stepContext.reasoningEffortInEffect ?? modelInfo.reasoningEffort ?? null;
    const to = moveReasoningEffort(modelInfo, { from, direction, steps });
    if (from === null || to === null || to === from) {
      return new Err(
        new MCPError(
          from === null ||
            from === "none" ||
            !supportsPerMessageReasoningEffort(modelInfo.endpoint.modelConfig)
            ? "Your reasoning effort cannot be changed with the current model and effort."
            : `Your reasoning effort is already at the ${direction === "raise" ? "highest" : "lowest"} one available ("${from}").`,
          { tracked: false }
        )
      );
    }

    return new Ok([
      makeReasoningEffortChangeOutput({
        from,
        to,
        text:
          `Your reasoning effort changes from "${from}" to "${to}". It applies from the user's ` +
          "next message at the latest.",
      }),
    ]);
  },
};

export const TOOLS = buildTools(SELF_CONFIGURATION_TOOLS_METADATA, handlers);
