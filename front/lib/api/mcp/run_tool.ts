import { McpError } from "@modelcontextprotocol/sdk/types.js";

import type {
  ActionBaseParams,
  MCPApproveExecutionEvent,
  MCPErrorEvent,
  MCPParamsEvent,
  MCPSuccessEvent,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { MCPServerPersonalAuthenticationRequiredError } from "@app/lib/actions/mcp_authentication";
import {
  executeMCPTool,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type { ToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp_internal_actions/events";
import { ToolBlockedAwaitingInputError } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/types";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { handleMCPActionError } from "@app/lib/api/mcp/error";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
} from "@app/types";
import { removeNulls } from "@app/types";

/**
 * Runs a tool with streaming for the given MCP action configuration.
 *
 * All errors within this function must be handled through `handleMCPActionError`
 * to ensure consistent error reporting and proper conversation flow control.
 * TODO(DURABLE_AGENTS 2025-08-05): This function is going to be used only to execute the tool.
 */
export async function* runToolWithStreaming(
  auth: Authenticator,
  {
    action,
    actionBaseParams,
    agentConfiguration,
    agentMessage,
    conversation,
  }: {
    action: AgentMCPActionResource;
    actionBaseParams: ActionBaseParams;
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationType;
  }
): AsyncGenerator<
  | MCPApproveExecutionEvent
  | MCPErrorEvent
  | MCPParamsEvent
  | MCPSuccessEvent
  | ToolNotificationEvent
  | ToolPersonalAuthRequiredEvent,
  void
> {
  const owner = auth.getNonNullableWorkspace();

  const { toolConfiguration, status, augmentedInputs: inputs } = action;

  const localLogger = logger.child({
    actionConfigurationId: toolConfiguration.sId,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
    workspaceId: conversation.owner.sId,
  });

  const tags = [
    `action:${toolConfiguration.name}`,
    `mcp_server:${toolConfiguration.mcpServerName}`,
    `workspace:${owner.sId}`,
    `workspace_name:${owner.name}`,
  ];

  const agentLoopRunContext: AgentLoopRunContextType = {
    agentConfiguration,
    agentMessage,
    conversation,
    stepContext: action.stepContext,
    toolConfiguration,
  };

  const toolCallResult = yield* executeMCPTool({
    auth,
    inputs,
    agentLoopRunContext,
    action,
    agentConfiguration,
    conversation,
    agentMessage,
  });

  if (!toolCallResult || toolCallResult.isErr()) {
    statsDClient.increment("mcp_actions_error.count", 1, tags);
    localLogger.error(
      {
        error: toolCallResult
          ? toolCallResult.error.message
          : "No tool call result",
      },
      "Error calling MCP tool on run."
    );

    const { error: toolErr } = toolCallResult ?? {};

    // If we got a personal authentication error, we emit a specific event that will be
    // deferred until after all tools complete, then converted to a tool_error.
    if (MCPServerPersonalAuthenticationRequiredError.is(toolErr)) {
      const authErrorMessage =
        `The tool ${actionBaseParams.functionCallName} requires personal ` +
        `authentication, please authenticate to use it.`;

      // Update the action to mark it as blocked because of a personal authentication error.
      await action.updateStatus("blocked_authentication_required");

      yield {
        type: "tool_personal_auth_required",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        conversationId: conversation.sId,
        authError: {
          mcpServerId: toolErr.mcpServerId,
          provider: toolErr.provider,
          toolName: actionBaseParams.functionCallName ?? "unknown",
          message: authErrorMessage,
          ...(toolErr.scope && {
            scope: toolErr.scope,
          }),
        },
      };

      return;
    } else if (toolErr instanceof ToolBlockedAwaitingInputError) {
      // Update the action status to blocked_child_action_input_required to break the agent loop.
      await action.updateStatus("blocked_child_action_input_required");

      // Update the step context to save the resume state.
      await action.updateStepContext({
        ...action.stepContext,
        resumeState: toolErr.resumeState,
      });

      // Yield the blocking events.
      for (const event of toolErr.blockingEvents) {
        yield event;
      }

      return;
    }

    let errorMessage: string;

    // We don't want to expose the MCP full error message to the user.
    if (toolErr && toolErr instanceof McpError && toolErr.code === -32001) {
      // MCP Error -32001: Request timed out.
      errorMessage = `The tool ${actionBaseParams.functionCallName} timed out. `;
    } else {
      errorMessage = `The tool ${actionBaseParams.functionCallName} returned an error. `;
    }
    errorMessage +=
      "An error occurred while executing the tool. You can inform the user of this issue.";

    yield await handleMCPActionError({
      action,
      agentConfiguration,
      agentMessage,
      status,
      errorMessage,
    });
    return;
  }

  const { outputItems, generatedFiles } = await processToolResults(auth, {
    action,
    conversation,
    localLogger,
    toolCallResult: toolCallResult.value,
    toolConfiguration,
  });

  statsDClient.increment("mcp_actions_success.count", 1, tags);

  await action.updateStatus("succeeded");

  yield {
    type: "tool_success",
    created: Date.now(),
    configurationId: agentConfiguration.sId,
    messageId: agentMessage.sId,
    action: {
      ...action.toJSON(),
      output: removeNulls(outputItems.map(hideFileFromActionOutput)),
      generatedFiles,
    },
  };
}
