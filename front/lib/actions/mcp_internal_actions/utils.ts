import type { MCPToolResult } from "@app/lib/actions/mcp_internal_actions/output_schemas";

export function makeMCPToolTextError(text: string): MCPToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}
