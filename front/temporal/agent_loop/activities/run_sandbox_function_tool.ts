import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { runToolWithStreaming } from "@app/lib/api/mcp/run_tool";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { getShutdownSignal } from "@app/lib/shutdown_signal";
import { drainAsyncGenerator } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Context } from "@temporalio/activity";

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

  // `runToolWithStreaming` executes the tool and persists the output. Its events are drained:
  // there is no invocation event stream to forward them to yet.
  // TODO(2026-07-08 SANDBOX_FUNCTIONS): forward these events to the invocation event stream once
  // it exists (e.g. viz progress).
  const abortSignal = AbortSignal.any([
    Context.current().cancellationSignal,
    getShutdownSignal(),
  ]);

  try {
    await drainAsyncGenerator(
      runToolWithStreaming(
        auth,
        { toolContext: { runContext } },
        { signal: abortSignal }
      )
    );

    // Pause resources make the run yield events and return without a terminal status. There is
    // no pause surface for function invocations yet, so fail closed to errored rather than leave
    // the action `running` with the poll hanging until token expiry. The pause resource is
    // persisted in the output, so the function sees what the tool needs (e.g. which provider to
    // authenticate) and handles it on its side. Approval bubbling replaces this with
    // `blocked_validation_required` plus an invocation stream event.
    if (!isToolExecutionStatusFinal(action.status)) {
      await action.markAsErrored({
        executionDurationMs: performance.now() - startTimeMs,
      });
    }
  } catch (err) {
    // The run throws when output cannot be persisted, and for `retry_on_interrupt` tools on
    // worker shutdown (a throw meant to trigger a Temporal retry that this workflow never grants,
    // maximumAttempts is 1). In both cases mark the action errored: a failed activity would leave
    // it `running` with the poll hanging until token expiry, and the calling frame is the retry
    // layer for functions. TODO(2026-07-09 SANDBOX_FUNCTIONS): honor retry_on_interrupt with a
    // retryable proxy dispatched on the action's retryPolicy, like the agent loop workflow.
    localLogger.error(
      { err: normalizeError(err) },
      "Failed to run sandbox function tool, marking action as errored"
    );
    await action.markAsErrored({
      executionDurationMs: performance.now() - startTimeMs,
    });
  }
}
