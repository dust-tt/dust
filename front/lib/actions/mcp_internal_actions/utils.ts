import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import {
  assertNever,
  INTERNAL_MIME_TYPES,
  isAgentPauseOutputResourceType,
} from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/server_constants";
import {
  AGENT_MEMORY_SERVER_NAME,
  INTERNAL_MCP_SERVERS,
  isInternalMCPServerOfName,
} from "@app/lib/actions/mcp_internal_actions/server_constants";
import type { INTERNAL_MCP_TOOLS_RUNNING_LABELS } from "@app/lib/actions/mcp_internal_actions/tool_constants";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { AgentMCPActionOutputItem } from "@app/lib/models/assistant/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  OAuthProvider,
} from "@app/types";

export function makeInternalMCPServer<S extends InternalMCPServerNameType>(
  serverName: S,
  options?: {
    augmentedInstructions?: string;
  }
): McpServer & {
  tool(): <T extends keyof (typeof INTERNAL_MCP_TOOLS_RUNNING_LABELS)[S]>(
    ...args: { name: T } & Parameters<McpServer["tool"]>
  ) => ReturnType<McpServer["tool"]>;
} {
  const { serverInfo } = INTERNAL_MCP_SERVERS[serverName];
  const instructions =
    options?.augmentedInstructions ?? serverInfo.instructions ?? undefined;

  return new McpServer(serverInfo, {
    instructions,
  });
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

export async function getExitOrPauseEvents({
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
> {
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
}

export function isJITMCPServerView(view: MCPServerViewType): boolean {
  return (
    !isInternalMCPServerOfName(view.server.sId, AGENT_MEMORY_SERVER_NAME) &&
    // Only tools that do not require any configuration can be enabled directly in a conversation.
    getMCPServerRequirements(view).noRequirement
  );
}
