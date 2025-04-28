import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result: string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: result },
    ],
  };
};

export const makeMCPToolJSONSuccess = ({
  message,
  result,
}: {
  message: string;
  result: any;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      { type: "text", text: message },
      { type: "text", text: JSON.stringify(result, null, 2) },
    ],
  };
};
