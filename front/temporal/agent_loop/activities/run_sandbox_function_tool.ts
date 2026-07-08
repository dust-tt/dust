import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import { processToolResults } from "@app/lib/actions/mcp_execution";
import type { SandboxFunctionRunContextType } from "@app/lib/actions/types";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withPeriodicHeartbeat } from "@app/lib/utils/async_utils";
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

  const invocation =
    await SandboxFunctionResource.fetchInvocationByModelIdWithAuth(
      auth,
      action.sandboxFunctionInvocationId
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

  const runContext: SandboxFunctionRunContextType = {
    contextType: "sandbox_function",
    action,
    invocation,
    toolConfiguration: action.toolConfiguration,
  };

  const startTime = performance.now();

  // Drain the generator: without `makeToolNotificationEvent`, progress notifications are consumed
  // but never yielded — there is no conversation surface to stream them to.
  const generator = tryCallMCPTool(
    auth,
    action.inputs,
    { runContext },
    { progressToken: action.id }
  );
  let iteratorResult = await generator.next();
  while (!iteratorResult.done) {
    iteratorResult = await generator.next();
  }
  const toolCallResult = iteratorResult.value;

  // Persist the output — a tool error's content included, the poll endpoint returns it alongside
  // the errored status — through the same result processing as the agent loop (writes the full
  // content array to the action's single GCS output object). Result processing can take minutes
  // when handling files, so heartbeat while it runs.
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
    // The poll contract requires a terminal status: a persistence failure (GCS retries
    // exhausted) must surface as an errored action, not an action stuck `running`. Catching our
    // own throw here is temporary — `processToolResults` throws because `createOutputItems`
    // does (see the TODO(2026-05-08 FLAV) in agent_mcp_action_resource.ts to Result-ify it and
    // its call sites); this catch goes away with that refactor.
    localLogger.error(
      { err: normalizeError(err) },
      "Failed to persist sandbox function tool output, marking action as errored"
    );
    await action.markAsErrored({
      executionDurationMs: Math.round(performance.now() - startTime),
    });
    return;
  }

  const executionDurationMs = Math.round(performance.now() - startTime);

  if (toolCallResult.isError) {
    await action.markAsErrored({ executionDurationMs });
  } else {
    await action.markAsSucceeded({ executionDurationMs });
  }
}
