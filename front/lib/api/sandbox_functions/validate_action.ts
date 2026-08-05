import type { MCPValidationOutputType } from "@app/lib/actions/constants";
import { isMCPApproveExecutionEvent } from "@app/lib/actions/mcp";
import { setUserAlwaysApprovedTool } from "@app/lib/actions/tool_status";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { buildSandboxFunctionAuditMetadata } from "@app/lib/api/sandbox_functions/audit";
import { getSandboxFunctionInvocationChannelId } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import logger from "@app/logger/logger";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/sandbox_functions/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

class SandboxFunctionActionValidationError extends Error {
  constructor(
    readonly type: "action_not_found" | "action_not_blocked" | "unauthorized",
    message: string
  ) {
    super(message);
  }
}

/**
 * Resolves a pending tool approval on a sandbox function invocation: flips the blocked action to
 * `running` and launches its execution workflow (approved), or to `denied` (rejected), which the
 * in-sandbox poll surfaces as a 403 rejection. The blocked action was created without a workflow,
 * so approval performs the first launch.
 */
export async function validateSandboxFunctionAction(
  auth: Authenticator,
  {
    sandboxFunction,
    invocationId,
    actionId,
    approvalState,
  }: {
    sandboxFunction: SandboxFunctionResource;
    invocationId: string;
    actionId: string;
    approvalState: MCPValidationOutputType;
  }
): Promise<Result<undefined, SandboxFunctionActionValidationError>> {
  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
  });
  // Out-of-scope lookups report as not-found, same shape as truly missing ones.
  if (!invocation) {
    return new Err(
      new SandboxFunctionActionValidationError(
        "action_not_found",
        "Action not found."
      )
    );
  }

  const action = await SandboxFunctionMCPActionResource.fetchById(
    auth,
    actionId
  );
  if (!action || action.invocationId !== invocation.sId) {
    return new Err(
      new SandboxFunctionActionValidationError(
        "action_not_found",
        "Action not found."
      )
    );
  }

  // Only the invocation's initiating user may approve or reject its tools. Strict equality also
  // rejects a null initiating user (userless origins have no legitimate interactive approver).
  if (invocation.userId !== auth.user()?.id) {
    return new Err(
      new SandboxFunctionActionValidationError(
        "unauthorized",
        "Only the user who initiated the invocation can validate its tools."
      )
    );
  }

  if (action.status !== "blocked_validation_required") {
    return new Err(
      new SandboxFunctionActionValidationError(
        "action_not_blocked",
        `Action is not blocked: ${action.status}.`
      )
    );
  }

  // Exhaustive so a future validation output cannot silently map to an approval.
  let resolvedStatus: "running" | "denied";
  switch (approvalState) {
    case "approved":
    case "always_approved":
      resolvedStatus = "running";
      break;
    case "rejected":
      resolvedStatus = "denied";
      break;
    default:
      resolvedStatus = assertNever(approvalState);
  }

  const [updatedCount] = await action.updateStatusFromExpected(auth, {
    status: resolvedStatus,
    expectedStatus: "blocked_validation_required",
  });

  // Concurrent resolutions have exactly one winner through the compare-and-swap; losers succeed
  // silently, the action already reached the state a resolution produces.
  if (updatedCount === 0) {
    logger.info(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        sandboxFunctionId: sandboxFunction.sId,
        invocationId: invocation.sId,
        actionId,
      },
      "Sandbox function action already approved or rejected"
    );
    return new Ok(undefined);
  }

  const user = auth.user();
  if (
    approvalState === "always_approved" &&
    user &&
    // Low-stake approvals are recorded globally per (server, tool), same keying as the
    // conversation flavor. Medium-stake records are keyed on an agent, which a sandbox function
    // has none of: treated as a one-time approval.
    action.toolConfiguration.permission === "low"
  ) {
    await setUserAlwaysApprovedTool(auth, {
      mcpServerId: action.toolConfiguration.toolServerId,
      functionCallName: action.toolConfiguration.name,
    });
  }

  // Same action as the conversation flavor, with pod function identifiers standing in for the
  // conversation ones. No agent metadata: a pod function has none.
  void emitAuditLogEvent({
    auth,
    action: "tool.approval_resolved",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("tool", {
        sId: action.toolConfiguration.name,
        name: action.toolConfiguration.originalName,
      }),
    ],
    context: getAuditLogContext(auth),
    metadata: {
      decision: approvalState,
      tool_name: action.toolConfiguration.originalName,
      mcp_server_name: action.toolConfiguration.mcpServerName,
      stake_level: action.toolConfiguration.permission,
      action_id: action.sId,
      ...buildSandboxFunctionAuditMetadata(invocation),
      deciding_user_id: user?.sId ?? "unknown",
      deciding_user_email: user?.email ?? "unknown",
    },
  });

  // Remove the pending approval event from the invocation channel so SSE history replay does not
  // resurface the approval card.
  await getRedisHybridManager().removeEvent(
    (event) => {
      const payload = JSON.parse(event.message["payload"]);
      return isMCPApproveExecutionEvent(payload)
        ? payload.actionId === actionId
        : false;
    },
    getSandboxFunctionInvocationChannelId({ invocationId: invocation.sId })
  );

  if (approvalState !== "rejected") {
    const launchResult = await launchSandboxFunctionToolWorkflow(auth, {
      action,
    });
    if (launchResult.isErr()) {
      // The action is already `running`; a failed launch would otherwise leave the poll hanging
      // until token expiry with no workflow. Compensate to a terminal `errored` (CAS-guarded so a
      // workflow that did start and already moved the status is not clobbered), then propagate.
      await action.updateStatusFromExpected(auth, {
        status: "errored",
        expectedStatus: "running",
      });
      throw launchResult.error;
    }
  }

  return new Ok(undefined);
}
