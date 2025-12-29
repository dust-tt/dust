import type { MCPApproveExecutionEvent } from "@dust-tt/client";
import {
  assertNever,
  INTERNAL_MIME_TYPES,
  isAgentPauseOutputResourceType,
} from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AGENT_MEMORY_SERVER_NAME,
  INTERNAL_MCP_SERVERS,
  isInternalMCPServerOfName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionOutputItemModel } from "@app/lib/models/agent/actions/mcp";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationWithoutContentType,
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

export async function getExitOrPauseEvents(
  auth: Authenticator,
  {
    outputItems,
    action,
    agentConfiguration,
    agentMessage,
    conversation,
  }: {
    outputItems: AgentMCPActionOutputItemModel[];
    action: AgentMCPActionResource;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationWithoutContentType;
  }
): Promise<
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
            userId: auth.user()?.sId,
            messageId: agentMessage.sId,
            conversationId: conversation.sId,
            actionId: action.sId,
            metadata: {
              toolName: action.toolConfiguration.originalName,
              mcpServerName: action.toolConfiguration.mcpServerName,
              agentName: agentConfiguration.name,
              mcpServerDisplayName: action.toolConfiguration.mcpServerName,
              mcpServerId: action.toolConfiguration.toolServerId,
            },
            inputs: action.augmentedInputs,
            authError: {
              mcpServerId: action.toolConfiguration.toolServerId,
              provider,
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

// Converts a JSON object to Markdown format with bullet points.
// Recursively handles nested objects and arrays with proper indentation.
// Includes protections against circular references and excessive depth.
export function jsonToMarkdown(
  data: any,
  indent: number = 0,
  visited: WeakSet<object> = new WeakSet(),
  maxDepth: number = 15
): string {
  const indentStr = "  ".repeat(indent);

  // Max depth protection
  if (indent >= maxDepth) {
    return `${indentStr}- [Max depth reached]`;
  }

  // Helper to format primitive values
  const formatValue = (value: any): string => {
    if (value === null || value === undefined) {
      return "(empty)";
    }
    if (typeof value === "string") {
      return (
        value
          // Remove newlines
          .replace(/[\r\n]+/g, " ")
          // Remove Markdown bold/italic patterns
          .replace(/\*\*\*/g, "") // Bold+italic (***text***)
          .replace(/\*\*/g, "") // Bold (**text**)
          .replace(/___/g, "") // Bold+italic (___text___)
          .replace(/__/g, "") // Bold (__text__)
          // Remove backticks for code
          .replace(/```/g, "") // Code blocks (```code```)
          .replace(/`/g, "") // Inline code (`code`)
          .trim()
      );
    }
    // Numbers and booleans
    return String(value);
  };

  // Handle primitives and special types
  if (typeof data !== "object" || data === null) {
    return `${indentStr}- ${formatValue(data)}`;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return `${indentStr}- []`;
    }
    if (visited.has(data)) {
      return `${indentStr}- [Circular Reference]`;
    }

    visited.add(data);
    const result = data
      .map((item) => jsonToMarkdown(item, indent, visited, maxDepth))
      .join("\n");
    visited.delete(data);
    return result;
  }

  // Handle objects
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return `${indentStr}- {}`;
  }
  if (visited.has(data)) {
    return `${indentStr}- [Circular Reference]`;
  }

  visited.add(data);
  const result = entries
    .map(([key, value]) => {
      // Handle nested objects and arrays
      if (value !== null && typeof value === "object") {
        if (Array.isArray(value) && value.length === 0) {
          return `${indentStr}- **${key}:** []`;
        }
        if (!Array.isArray(value) && Object.entries(value).length === 0) {
          return `${indentStr}- **${key}:** {}`;
        }
        return `${indentStr}- **${key}:**\n${jsonToMarkdown(value, indent + 1, visited, maxDepth)}`;
      }

      // Handle primitives
      return `${indentStr}- **${key}:** ${formatValue(value)}`;
    })
    .join("\n");

  visited.delete(data);
  return result;
}
