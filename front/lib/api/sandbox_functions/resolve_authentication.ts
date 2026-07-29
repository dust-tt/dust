import { isToolPersonalAuthRequiredEvent } from "@app/lib/actions/mcp";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import { getSandboxFunctionInvocationChannelId } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import logger from "@app/logger/logger";
import { launchSandboxFunctionToolWorkflow } from "@app/temporal/sandbox_functions/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ResolveAuthenticationOutcome = "completed" | "denied";

export class SandboxFunctionActionAuthenticationError extends Error {
  constructor(
    readonly type: "action_not_found" | "action_not_blocked" | "unauthorized",
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

  // Only the initiating user may resolve authentication. Strict equality also rejects a null
  // initiating user (userless origins): a userless invocation can still reach a personal-auth block
  // via a stake-gated personal_actions tool, and we will not run a personal-OAuth tool under
  // whichever member happens to resolve it.
  if (invocation.userId !== auth.user()?.id) {
    return new Err(
      new SandboxFunctionActionAuthenticationError(
        "unauthorized",
        "Only the user who initiated the invocation can resolve its authentication."
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
