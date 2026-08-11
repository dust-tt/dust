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
import { hideFileFromActionOutput } from "@app/lib/actions/mcp_utils";
import type { ToolContext, ToolOutputItemType } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { handleMCPActionError } from "@app/lib/api/mcp/error";
import type { Authenticator } from "@app/lib/auth";
import { withPeriodicHeartbeat } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS } from "@app/temporal/agent_loop/config";
import { removeNulls } from "@app/types/shared/utils/general";
import { heartbeat } from "@temporalio/activity";
import assert from "assert";

/**
 * Runs a tool with streaming for the given tool context.
 *
 * All errors within this function must be handled through `handleMCPActionError`
 * to ensure consistent error reporting and proper conversation flow control.
 */
export async function* runToolWithStreaming(
  auth: Authenticator,
  {
    toolContext,
  }: {
    toolContext: ToolContext;
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
  const { runContext } = toolContext;
  assert(runContext, "runToolWithStreaming requires a tool run context.");

  const { action, toolConfiguration } = runContext;
  const { status } = action;

  const signal = options?.signal;

  // Inputs as issued in the run context. For agent-loop runs, user-edited inputs (if any)
  // override the augmented inputs.
  const inputs = isAgentLoopRunContext(runContext)
    ? {
        ...runContext.action.augmentedInputs,
        ...(runContext.action.userEditedInputs ?? {}),
      }
    : runContext.action.inputs;

  const localLogger = logger.child({
    actionConfigurationId: toolConfiguration.sId,
    workspaceId: auth.getNonNullableWorkspace().sId,
    ...(isAgentLoopRunContext(runContext)
      ? {
          conversationId: runContext.conversation.sId,
          messageId: runContext.agentMessage.sId,
        }
      : {
          sandboxFunctionId: runContext.invocation.sandboxFunction.sId,
          invocationId: runContext.invocation.sId,
        }),
  });

  // Sandbox function actions and auto-allowed agent-loop actions are created in running
  // status; only approved or resumed actions still carry a pre-run status to transition.
  if (isAgentLoopRunContext(runContext) && status !== "running") {
    await runContext.action.updateStatus("running");
  }
  const startDate = performance.now();

  const intermediateOutputItems: ToolOutputItemType[] = [];

  const toolCallResult = yield* tryCallMCPTool(auth, inputs, toolContext, {
    progressToken: action.id,
    makeToolNotificationEvent: async (notification) => {
      const { event, outputItems } = await processToolNotification(
        auth,
        notification,
        { toolContext }
      );
      intermediateOutputItems.push(...outputItems);
      return event;
    },
    signal,
  });

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
        toolCallResultStructuredContent: toolCallResult.structuredContent,
        toolContext,
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
    toolContext,
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
    output: removeNulls(
      [...intermediateOutputItems, ...outputItems].map(hideFileFromActionOutput)
    ),
    generatedFiles,
  };
}
