import type { MCPToolResult } from "@app/lib/actions/mcp_actions";

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
