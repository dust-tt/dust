import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { Err, Ok } from "@app/types/shared/result";
import { truncate } from "@app/types/shared/utils/string_utils";

const MAX_ATTEMPTED_ACTION_NAME_LENGTH = 256;

// This server has dynamically created tools based on the agentLoopContext.
// The tool name comes from the context at runtime.
// TODO(spolu): move to AgentLoopRunContextType
export function createMissingActionCatcherTools(
  agentLoopContext?: ToolContext
): ToolDefinition[] {
  if (agentLoopContext) {
    const actionName = agentLoopContext.runContext
      ? agentLoopContext.runContext.toolConfiguration.name
      : agentLoopContext.listToolsContext?.agentActionConfiguration.name;

    if (!actionName) {
      throw new Error("No action name found");
    }

    const attemptedActionName = isAgentLoopRunContext(
      agentLoopContext.runContext
    )
      ? agentLoopContext.runContext.action.functionCallName
      : actionName;

    return [
      {
        name: actionName,
        description: "",
        schema: {},
        stake: "never_ask",
        displayLabels: {
          running: "Processing action",
          done: "Process action",
        },
        toolCostCategory: "basic" as const,
        freeUsage: true,
        handler: async () => {
          const displayedActionName = truncate(
            attemptedActionName,
            MAX_ATTEMPTED_ACTION_NAME_LENGTH
          );

          return new Err(
            new MCPError(
              `Tool "${displayedActionName}" not found. ` +
                "This answer to the function call is a catch-all.\n" +
                "  1. The function name needs to be checked to ensure it matches one of the tools " +
                "available (case sensitivity, word separators, ...).\n" +
                "  2. If the function comes from a skill, the skill needs to be enabled first.\n" +
                "  3. Search for the exact tool name instead of guessing, then retry with the " +
                "correct name.\n" +
                "This action can safely be retried with another name or with the same name after " +
                "enabling a skill.",
              { tracked: false }
            )
          );
        },
      },
    ];
  }

  return [
    {
      name: "placeholder_tool",
      description: "This tool is a placeholder to catch missing actions.",
      schema: {},
      stake: "never_ask",
      displayLabels: {
        running: "Processing action",
        done: "Process action",
      },
      toolCostCategory: "basic" as const,
      freeUsage: true,
      handler: async () => {
        return new Ok([{ type: "text", text: "No action name found" }]);
      },
    },
  ];
}
