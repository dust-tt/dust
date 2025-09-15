import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  RunAgentBlockingEvent,
  RunAgentResumeState,
} from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import type { OAuthProvider } from "@app/types";

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

export function makeToolBlockedAwaitingInputResponse(
  blockingEvents: RunAgentBlockingEvent[],
  state: RunAgentResumeState
): CallToolResult {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.INTERNAL_TOOL_OUTPUT,
          type: "tool_blocked_awaiting_input",
          text: "Tool requires resume after blocking events",
          uri: "",
          blockingEvents,
          state,
        },
      },
    ],
  };
}

export function makePersonalAuthenticationError(
  provider: OAuthProvider,
  mcpServerId: string,
  scope?: string
) {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.INTERNAL_TOOL_OUTPUT,
          type: "tool_personal_auth_required",
          mcpServerId,
          scope,
          provider,
          text: "Personal authentication required",
          uri: "",
        },
      },
    ],
  };
}

export function makeMCPToolExit({
  message,
  isError,
}: {
  message: string;
  isError: boolean;
}) {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.INTERNAL_TOOL_OUTPUT,
          text: message,
          type: "tool_early_exit",
          isError,
          uri: "",
        },
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
