import { isToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { getSandboxFunctionInvocationChannelId } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import logger from "@app/logger/logger";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/agent_loop/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ResolveAuthenticationOutcome = "completed" | "denied";

export class SandboxFunctionActionAuthenticationError extends Error {
  constructor(
    readonly type: "action_not_found" | "action_not_blocked",
    message: string
  ) {
    super(message);
  }
}

/**
 * Resolves a personal-authentication block on a sandbox function tool action. On `completed` the
 * blocked action flips back to `running` and its workflow is relaunched: the tool re-runs from
 * scratch and now finds the personal connection (the block happened at connection time, before the
 * tool call, so there are no partial side effects to worry about). On `denied` the action becomes
 * terminal `denied`, which the in-sandbox poll surfaces as a 403 rejection.
 */
export async function resolveSandboxFunctionActionAuthentication(
  auth: Authenticator,
  {
    sandboxFunction,
    invocationId,
    actionId,
    outcome,
  }: {
    sandboxFunction: SandboxFunctionResource;
    invocationId: string;
    actionId: string;
    outcome: ResolveAuthenticationOutcome;
  }
): Promise<Result<undefined, SandboxFunctionActionAuthenticationError>> {
  const invocation = await SandboxFunctionInvocationResource.fetchById(auth, {
    sandboxFunction,
    invocationId,
  });
  // Out-of-scope lookups report as not-found, same shape as truly missing ones.
  if (!invocation) {
    return new Err(
      new SandboxFunctionActionAuthenticationError(
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
      new SandboxFunctionActionAuthenticationError(
        "action_not_found",
        "Action not found."
      )
    );
  }

  if (action.status !== "blocked_authentication_required") {
    return new Err(
      new SandboxFunctionActionAuthenticationError(
        "action_not_blocked",
        `Action is not blocked on authentication: ${action.status}.`
      )
    );
  }

  // TODO(2026-07-16 SECURITY): enforce resolver == initiating user here. The invocation does not
  // yet persist an initiating user; a follow-up adds a userId to the invocation model, then this
  // gates via canCurrentUserRespondToParentUserMessage so the tool cannot re-run under another
  // member's personal connection.
  const [updatedCount] = await action.updateStatusFromExpected(auth, {
    status: outcome === "completed" ? "running" : "denied",
    expectedStatus: "blocked_authentication_required",
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
      "Sandbox function action authentication already resolved"
    );
    return new Ok(undefined);
  }

  // Remove the pending authentication event from the invocation channel so SSE history replay
  // does not resurface the authentication card.
  await getRedisHybridManager().removeEvent(
    (event) => {
      const payload = JSON.parse(event.message["payload"]);
      return isToolPersonalAuthRequiredEvent(payload)
        ? payload.actionId === actionId
        : false;
    },
    getSandboxFunctionInvocationChannelId({ invocationId: invocation.sId })
  );

  if (outcome === "completed") {
    try {
      await launchSandboxFunctionToolWorkflow(auth, { action });
    } catch (err) {
      // The action is already `running`; a failed launch would otherwise leave the poll hanging
      // until token expiry with no workflow. Compensate to a terminal `errored` (CAS-guarded so a
      // workflow that did start and already moved the status is not clobbered), then rethrow.
      await action.updateStatusFromExpected(auth, {
        status: "errored",
        expectedStatus: "running",
      });
      throw err;
    }
  }

  return new Ok(undefined);
}
