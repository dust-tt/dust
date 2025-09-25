// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { Context } from "@temporalio/activity";

import { RETRY_ON_INTERRUPT_MAX_ATTEMPTS } from "@app/lib/actions/constants";
import type {
  MCPApproveExecutionEvent,
  MCPErrorEvent,
  MCPParamsEvent,
  MCPSuccessEvent,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import {
  processToolNotification,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/utils";
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { getRetryPolicyFromToolConfiguration } from "@app/lib/api/mcp";
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
    agentConfiguration,
    agentMessage,
    conversation,
  }: {
    action: AgentMCPActionResource;
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
  | ToolPersonalAuthRequiredEvent
  | ToolEarlyExitEvent,
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

  const toolCallResult = yield* tryCallMCPTool(
    auth,
    inputs,
    agentLoopRunContext,
    {
      progressToken: action.id,
      makeToolNotificationEvent: (notification) =>
        processToolNotification(notification, {
          action,
          agentConfiguration,
          conversation,
          agentMessage,
        }),
    }
  );

  // Err here means an exception ahead of calling the tool, like a connection error, an input
  // validation error, or any other kind of error from MCP, but not a tool error, which are returned
  // as content.
  if (toolCallResult.isErr()) {
    statsDClient.increment("mcp_actions_error.count", 1, tags);
    localLogger.error(
      {
        error: toolCallResult.error.message,
      },
      "Error calling MCP tool on run."
    );

    const { error: toolError } = toolCallResult;

    const isMCPTimeoutError =
      toolError instanceof McpError && toolError.code === -32001;

    let errorMessage: string;
    if (isMCPTimeoutError) {
      errorMessage = `The execution of tool ${action.functionCallName} timed out.`;

      // If the tool should not be retried on interrupt, the error is returned
      // to the model, to let it decide what to do. If the tool should be
      // retried on interrupt, we throw an error so the workflow retries the
      // `runTool` activity, unless it's the last attempt.
      const retryPolicy =
        getRetryPolicyFromToolConfiguration(toolConfiguration);
      if (retryPolicy === "retry_on_interrupt") {
        const info = Context.current().info;
        const isLastAttempt = info.attempt >= RETRY_ON_INTERRUPT_MAX_ATTEMPTS;
        if (!isLastAttempt) {
          errorMessage += ` Error: ${toolError.message}`;
          throw new Error(errorMessage, { cause: toolError });
        }
      }
    } else {
      errorMessage = `The tool ${action.functionCallName} failed with the following error: ${toolError.message}`;
    }

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

  // Parse the output resources to check if we find special events that require the agent loop to pause.
  // This could be an authentication, validation, or unconditional exit from the action.
  const agentPauseEvents = await getExitOrPauseEvents({
    outputItems,
    action,
    agentConfiguration,
    agentMessage,
    conversation,
  });

  if (agentPauseEvents.length > 0) {
    for (const event of agentPauseEvents) {
      yield event;
    }
    return;
  } else {
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
}
