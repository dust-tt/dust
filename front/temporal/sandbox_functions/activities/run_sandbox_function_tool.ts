import { isSandboxFunctionToolEvent } from "@app/lib/actions/mcp";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import type { SandboxFunctionRunContext } from "@app/lib/actions/types";
import { isLightClientSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { runToolWithStreaming } from "@app/lib/api/mcp/run_tool";
import { buildSandboxFunctionAuditMetadata } from "@app/lib/api/sandbox_functions/audit";
import { publishSandboxFunctionInvocationEvent } from "@app/lib/api/sandbox_functions/events";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { getShutdownSignal } from "@app/lib/shutdown_signal";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Context } from "@temporalio/activity";
import assert from "assert";

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

  const abortSignal = AbortSignal.any([
    Context.current().cancellationSignal,
    getShutdownSignal(),
  ]);

  try {
    for await (const event of runToolWithStreaming(
      auth,
      { toolContext: { runContext } },
      { signal: abortSignal }
    )) {
      switch (event.type) {
        case "tool_personal_auth_required":
          assert(
            isSandboxFunctionToolEvent(event),
            "Expected a sandbox function authentication event."
          );
          await publishSandboxFunctionInvocationEvent(event, {
            invocationId: invocation.sId,
          });
          break;
        case "tool_approve_execution":
        case "tool_ask_user_question":
        case "tool_early_exit":
        case "tool_error":
        case "tool_file_auth_required":
        case "tool_notification":
        case "tool_paused":
          break;
        case "tool_success":
          // Same action as the agent loop emits, with the invoking user as actor and pod function
          // identifiers standing in for the conversation ones.
          void emitAuditLogEvent({
            auth,
            action: "tool.executed",
            targets: [
              buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
              buildAuditLogTarget("tool", {
                sId: action.toolConfiguration.name,
                name: action.toolConfiguration.originalName,
              }),
            ],
            metadata: {
              tool_name: action.toolConfiguration.originalName,
              tool_type: isLightClientSideMCPToolConfiguration(
                action.toolConfiguration
              )
                ? "remote"
                : "internal",
              mcp_server_name: action.toolConfiguration.mcpServerName,
              action_id: action.sId,
              ...buildSandboxFunctionAuditMetadata(invocation),
              initiating_user_id: auth.user()?.sId ?? "unknown",
              initiating_user_email: auth.user()?.email ?? "unknown",
            },
          });
          break;
        default:
          assertNever(event);
      }
    }

    // Personal authentication is an expected non-terminal pause surfaced through the invocation
    // stream. Other pause resources still fail closed until their resolution flows are wired.
    if (
      !isToolExecutionStatusFinal(action.status) &&
      action.status !== "blocked_authentication_required"
    ) {
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
