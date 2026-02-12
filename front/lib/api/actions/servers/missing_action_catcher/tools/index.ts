import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { Err, Ok } from "@app/types/shared/result";

// This server has dynamically created tools based on the agentLoopContext.
// The tool name comes from the context at runtime.
export function createMissingActionCatcherTools(
  agentLoopContext?: AgentLoopContextType
): ToolDefinition[] {
  if (agentLoopContext) {
    const actionName = agentLoopContext.runContext
      ? agentLoopContext.runContext.toolConfiguration.name
      : agentLoopContext.listToolsContext?.agentActionConfiguration.name;

    if (!actionName) {
      throw new Error("No action name found");
    }

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
        // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
        handler: async () => {
          return new Err(
            new MCPError(
              `Tool "${actionName}" not found. ` +
                "This answer to the function call is a catch-all.\n" +
                "  1. The function name needs to be checked to ensure it matches one of the tools " +
                "available (case sensitivity, word separators, ...).\n" +
                "  2. If the function comes from a skill, the skill needs to be enabled first.\n" +
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
      // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
      handler: async () => {
        return new Ok([{ type: "text", text: "No action name found" }]);
      },
    },
  ];
}
