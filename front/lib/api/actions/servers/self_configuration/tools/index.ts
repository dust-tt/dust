import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { raiseReasoningEffort } from "@app/lib/api/actions/servers/self_configuration/helpers";
import {
  ADJUST_REASONING_EFFORT_TOOL_NAME,
  SELF_CONFIGURATION_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/self_configuration/metadata";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const handlers: ToolHandlers<typeof SELF_CONFIGURATION_TOOLS_METADATA> = {
  [ADJUST_REASONING_EFFORT_TOOL_NAME]: async (
    { direction, steps = 1 },
    { runContext }
  ) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    if (direction === "lower") {
      return new Err(
        new MCPError("Lowering your reasoning effort is not supported yet.", {
          tracked: false,
        })
      );
    }

    const { modelInfo, stepContext } = runContext;
    const from =
      stepContext.reasoningEffortInEffect ?? modelInfo.reasoningEffort;
    const to = raiseReasoningEffort(modelInfo, { from, steps });
    if (to === undefined || to === from) {
      return new Err(
        new MCPError(
          from === undefined
            ? "Your reasoning effort cannot be raised."
            : `Your reasoning effort is already at the highest one available ("${from}").`,
          { tracked: false }
        )
      );
    }

    return new Ok([
      {
        type: "text",
        text:
          `Your reasoning effort goes from "${from}" to "${to}" from the user's next message on: ` +
          "the answer you are writing keeps its current effort.",
      },
    ]);
  },
};

export const TOOLS = buildTools(SELF_CONFIGURATION_TOOLS_METADATA, handlers);
