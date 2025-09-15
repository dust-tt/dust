// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { McpError } from "@modelcontextprotocol/sdk/types.js";

import type {
  ActionBaseParams,
  MCPApproveExecutionEvent,
  MCPErrorEvent,
  MCPParamsEvent,
  MCPSuccessEvent,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import {
  executeMCPTool,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type {
  ToolEarlyExitEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getAgentPauseEvents } from "@app/lib/actions/mcp_internal_actions/utils";
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

    let errorMessage: string;

    // We don't want to expose the MCP full error message to the user.
    if (toolErr && toolErr instanceof McpError && toolErr.code === -32001) {
      // MCP Error -32001: Request timed out.
      errorMessage = `The tool ${actionBaseParams.functionCallName} timed out. `;

      // If the tool should be retried on interrupt, we throw an error so the workflow retries the
      // `runTool` activity. If the tool should not be retried on interrupt, the error is returned to
      // the model, to let it decide what to do.
      const retryPolicy =
        getRetryPolicyFromToolConfiguration(toolConfiguration);
      if (retryPolicy === "retry_on_interrupt") {
        errorMessage += "Error: " + JSON.stringify(toolErr);
        throw new Error(errorMessage);
      }
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

  // Parse the output resources to check if we find special events that require the agent loop to pause.
  // This could be an authentication, validation, or unconditional exit from the action.
  const agentPauseEvents = await getAgentPauseEvents({
    outputItems,
    action,
    actionBaseParams,
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
