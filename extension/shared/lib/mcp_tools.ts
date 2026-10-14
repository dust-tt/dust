import type {
  BaseToolHandlerExtra,
  ToolDefinition,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod";

/**
 * Registers client-side tools built with `buildTools` on the MCP server.
 * The tool metadata (stake, display labels, arguments requiring approval) is sent in `_meta.dust`.
 */
export function registerClientTools(
  server: McpServer,
  tools: ToolDefinition<string, ZodRawShape, BaseToolHandlerExtra>[]
): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        _meta: {
          dust: {
            stake: tool.stake,
            displayLabels: tool.displayLabels,
            ...(tool.argumentsRequiringApproval
              ? { argumentsRequiringApproval: tool.argumentsRequiringApproval }
              : {}),
          },
        },
      },
      async (params, extra) => {
        const result = await tool.handler(params, extra);
        if (result.isErr()) {
          return {
            isError: true,
            content: [{ type: "text" as const, text: result.error.message }],
          };
        }
        return {
          isError: false,
          content: result.value,
        };
      }
    );
  }
}
