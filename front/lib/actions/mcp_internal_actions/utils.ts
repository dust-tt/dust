import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import {
  assertNever,
  INTERNAL_MIME_TYPES,
  isAgentPauseOutputResourceType,
} from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import type {
  RunAgentBlockingEvent,
  RunAgentResumeState,
} from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import type { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  OAuthProvider,
} from "@app/types";

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
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
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
  scope?: string
) {
  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
          type: "tool_personal_auth_required",
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
          mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.AGENT_PAUSE_TOOL_OUTPUT,
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

export const getExitOrPauseEvents = async ({
  outputItems,
  action,
  agentConfiguration,
  agentMessage,
  conversation,
}: {
  outputItems: AgentMCPActionOutputItem[];
  action: AgentMCPActionResource;
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  conversation: ConversationType;
}): Promise<
  (
    | MCPApproveExecutionEvent
    | ToolPersonalAuthRequiredEvent
    | ToolEarlyExitEvent
  )[]
> => {
  const exitOutputItem = outputItems
    .map((item) => item.content)
    .find(isAgentPauseOutputResourceType)?.resource;

  if (exitOutputItem) {
    switch (exitOutputItem.type) {
      case "tool_early_exit": {
        const { isError, text } = exitOutputItem;
        return [
          {
            type: "tool_early_exit",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            conversationId: conversation.sId,
            messageId: agentMessage.sId,
            text: text,
            isError: isError,
          },
        ];
      }
      case "tool_blocked_awaiting_input": {
        const { blockingEvents, state } = exitOutputItem;
        // Update the action status to blocked_child_action_input_required to break the agent loop.
        await action.updateStatus("blocked_child_action_input_required");

        // Update the step context to save the resume state.
        await action.updateStepContext({
          ...action.stepContext,
          resumeState: state,
        });

        // Yield the blocking events.
        return blockingEvents;
      }
      case "tool_personal_auth_required": {
        const { provider, scope } = exitOutputItem;

        const authErrorMessage =
          `The tool ${action.functionCallName} requires personal ` +
          `authentication, please authenticate to use it.`;

        // Update the action to mark it as blocked because of a personal authentication error.
        await action.updateStatus("blocked_authentication_required");

        return [
          {
            type: "tool_personal_auth_required",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            conversationId: conversation.sId,
            authError: {
              mcpServerId: action.toolConfiguration.toolServerId,
              provider: provider,
              toolName: action.functionCallName ?? "unknown",
              message: authErrorMessage,
              ...(scope && {
                scope,
              }),
            },
          },
        ];
      }
      default: {
        assertNever(exitOutputItem);
      }
    }
  }

  return [];
};
