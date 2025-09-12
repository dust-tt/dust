import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";

export function makeInternalMCPServer(
  serverName: InternalMCPServerNameType,
  options?: {
    augmentedInstructions?: string;
  }
): McpServer {
  const { serverInfo } = INTERNAL_MCP_SERVERS[serverName];
  const instructions =
    options?.augmentedInstructions ?? serverInfo.instructions ?? undefined;

  return new McpServer(serverInfo, {
    instructions,
  });
}

export function makeMCPToolTextError(text: string): {
  isError: true;
  content: [TextContent];
} {
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

export function makeMCPToolExit(
  message: string,
  isError: boolean
): {
  isError: true;
  content: [TextContent];
} {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `{"__exit": {"isError": ${isError}, "message": ${JSON.stringify(message)}}}`,
      },
    ],
  };
}

export const makeMCPToolTextSuccess = ({
  message,
  result,
}: {
  message: string;
  result?: string;
}): CallToolResult => {
  if (!result) {
    return {
      isError: false,
      content: [{ type: "text", text: message }],
    };
  }
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
  message?: string;
  result: object | string;
}): CallToolResult => {
  return {
    isError: false,
    content: [
      ...(message ? [{ type: "text" as const, text: message }] : []),
      { type: "text" as const, text: JSON.stringify(result, null, 2) },
    ],
  };
};
