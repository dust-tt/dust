import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";

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

/**
 * Helper to get MCP server ID from agent loop context
 */
export const getMcpServerIdFromContext = (
  agentLoopContext?: AgentLoopContextType
): string | null => {
  const actionConfig = agentLoopContext?.runContext?.actionConfiguration;
  if (actionConfig && isServerSideMCPToolConfiguration(actionConfig)) {
    return actionConfig.internalMCPServerId || null;
  }
  return null;
};
