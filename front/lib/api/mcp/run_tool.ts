import type {
  MCPErrorEvent,
  MCPSuccessEvent,
  ToolNotificationEvent,
} from "@app/lib/actions/mcp";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import {
  processToolNotification,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type {
  MCPApproveExecutionEvent,
  ToolAskUserQuestionEvent,
  ToolEarlyExitEvent,
  ToolFileAuthRequiredEvent,
  ToolPausedEvent,
  ToolPersonalAuthRequiredEvent,
} from "@app/lib/actions/mcp_internal_actions/events";
import { getExitOrPauseEvents } from "@app/lib/actions/mcp_internal_actions/exit_events";
import type { AgentLoopRunContextType } from "@app/lib/actions/types";
import { handleMCPActionError } from "@app/lib/api/mcp/error";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { withPeriodicHeartbeat } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS } from "@app/temporal/agent_loop/config";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { heartbeat } from "@temporalio/activity";

const TOOL_RESULT_PROCESSING_HEARTBEAT_TIMEOUT_MARGIN_MS = 5 * 1000;
const TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS =
  TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS -
  TOOL_RESULT_PROCESSING_HEARTBEAT_TIMEOUT_MARGIN_MS;

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
    model,
    agentMessage,
    conversation,
    userMessage,
  }: {
    action: AgentMCPActionResource;
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    model: AgentLoopExecutionData["model"];
    agentMessage: AgentLoopExecutionData["agentMessage"];
    conversation: AgentLoopExecutionData["conversation"];
    userMessage: AgentLoopExecutionData["userMessage"];
  },
  options?: { signal?: AbortSignal }
): AsyncGenerator<
  | MCPApproveExecutionEvent
  | MCPErrorEvent
  | MCPSuccessEvent
  | ToolNotificationEvent
  | ToolFileAuthRequiredEvent
  | ToolPersonalAuthRequiredEvent
  | ToolEarlyExitEvent
  | ToolAskUserQuestionEvent
  | ToolPausedEvent,
  void
> {
  const { toolConfiguration, status, augmentedInputs: inputs } = action;

  const signal = options?.signal;

  const localLogger = logger.child({
    actionConfigurationId: toolConfiguration.sId,
    conversationId: conversation.sId,
    messageId: agentMessage.sId,
    workspaceId: conversation.owner.sId,
  });

  const agentLoopRunContext: AgentLoopRunContextType = {
    contextType: "agent_loop",
    action,
    agentConfiguration,
    model,
    agentMessage,
    conversation,
    stepContext: action.stepContext,
    toolConfiguration,
    userMessage,
  };

  await action.updateStatus("running");
  const startDate = performance.now();

  const intermediateOutputItems: CallToolResult["content"] = [];

  const toolCallResult = yield* tryCallMCPTool(
    auth,
    inputs,
    { runContext: agentLoopRunContext },
    {
      progressToken: action.id,
      makeToolNotificationEvent: async (notification) => {
        const { event, outputItems } = await processToolNotification(
          auth,
          notification,
          { toolContext: { runContext: agentLoopRunContext } }
        );
        intermediateOutputItems.push(...outputItems);
        return event;
      },
      signal,
    }
  );

  // Err here means an exception ahead of calling the tool, like a connection error, an input
  // validation error, or any other kind of error from MCP, but not a tool error, which are returned
  // as content.
  if (toolCallResult.isError) {
    const endDate = performance.now();
    yield await handleMCPActionError(auth, {
      action,
      status,
      errorContent: toolCallResult.content,
      executionDurationMs: endDate - startDate,
    });
    return;
  }

  // Tool result processing can legitimately take up to 5 minutes when processing files,
  // so heartbeat while this scoped post-processing phase is running.
  const { outputItems, generatedFiles } = await withPeriodicHeartbeat(
    () =>
      processToolResults(auth, {
        localLogger,
        toolCallResultContent: toolCallResult.content,
        toolContext: { runContext: agentLoopRunContext },
      }),
    {
      intervalMs: TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS,
      heartbeatFn: () => {
        heartbeat();
        localLogger.info("MCP tool result processing heartbeat");
      },
    }
  );

  // Parse the output resources to check if we find special events that require the agent loop to pause.
  // This could be an authentication, validation, or unconditional exit from the action.
  const agentPauseEvents = await getExitOrPauseEvents(auth, {
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
  }

  const endDate = performance.now();
  await action.markAsSucceeded({ executionDurationMs: endDate - startDate });

  yield {
    type: "tool_success",
    created: Date.now(),
    output: [...intermediateOutputItems, ...outputItems],
    generatedFiles,
  };
}
