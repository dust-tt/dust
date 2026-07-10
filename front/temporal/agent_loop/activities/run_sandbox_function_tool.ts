import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import {
  processToolNotification,
  processToolResults,
} from "@app/lib/actions/mcp_execution";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import {
  drainAsyncGenerator,
  withPeriodicHeartbeat,
} from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS } from "@app/temporal/agent_loop/config";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { heartbeat } from "@temporalio/activity";

export async function runSandboxFunctionToolActivity(
  authType: AuthenticatorType,
  { actionModelId }: { actionModelId: ModelId }
): Promise<void> {
  const auth = await Authenticator.fromJsonWithRefrehedGroups(authType);

  const action = await SandboxFunctionMCPActionResource.fetchByModelIdWithAuth(
    auth,
    actionModelId
  );
  if (!action) {
    logger.error(
      { actionModelId },
      "Sandbox function MCP action not found, skipping tool execution"
    );
    return;
  }

  const invocation = await SandboxFunctionResource.fetchInvocationForAction(
    auth,
    action
  );
  if (!invocation) {
    await action.markAsErrored({ executionDurationMs: 0 });
    logger.error(
      { actionModelId, actionId: action.sId },
      "Sandbox function invocation not found, marking action as errored"
    );
    return;
  }

  const localLogger = logger.child({
    actionId: action.sId,
    invocationId: invocation.sId,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  const runContext: SandboxFunctionRunContext = {
    contextType: "sandbox_function",
    action,
    invocation,
    toolConfiguration: action.toolConfiguration,
  };

  const startTimeMs = performance.now();

  // `processToolNotification` persists `store_resource` progress output on the action. The event
  // it returns has no stream to reach yet (there is no invocation event stream), so we drain the
  // generator for the tool result (its return value) and discard the events.
  // TODO(2026-07-08 SANDBOX_FUNCTIONS): forward these events to the invocation event stream once
  // it exists (e.g. viz progress).
  const toolCallResult = await drainAsyncGenerator(
    tryCallMCPTool(
      auth,
      action.inputs,
      { runContext },
      {
        progressToken: action.id,
        makeToolNotificationEvent: async (notification) => {
          const { event } = await processToolNotification(auth, notification, {
            toolContext: { runContext },
          });
          return event;
        },
      }
    )
  );

  // Persist the output through the same result processing as the agent loop: the full content
  // array goes to the action's single GCS output object. Error content is persisted too, the
  // poll endpoint returns it alongside the errored status. Processing can take minutes when
  // handling files, so heartbeat while it runs.
  try {
    await withPeriodicHeartbeat(
      () =>
        processToolResults(auth, {
          localLogger,
          toolCallResultContent: toolCallResult.content,
          toolContext: { runContext },
        }),
      {
        intervalMs: TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS,
        heartbeatFn: () => {
          heartbeat();
          localLogger.info("MCP tool result processing heartbeat");
        },
      }
    );
  } catch (err) {
    // `processToolResults` throws when output cannot be persisted (no acceptable degraded
    // state). The agent loop lets that abort the step; here there is no step to abort, so catch
    // it and mark the action errored, otherwise it would stay `running` and the poll never
    // reaches a terminal status.
    localLogger.error(
      { err: normalizeError(err) },
      "Failed to persist sandbox function tool output, marking action as errored"
    );
    await action.markAsErrored({
      executionDurationMs: Math.round(performance.now() - startTimeMs),
    });
    return;
  }

  const executionDurationMs = Math.round(performance.now() - startTimeMs);

  if (toolCallResult.isError) {
    await action.markAsErrored({ executionDurationMs });
  } else {
    await action.markAsSucceeded({ executionDurationMs });
  }
}
