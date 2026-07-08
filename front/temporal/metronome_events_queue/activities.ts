import { getAuditLogContext } from "@app/lib/api/audit/workos_audit";
import { processMetronomeWebhook } from "@app/lib/api/metronome/process_webhook";
import { reconcileWorkspaceUserCreditStates } from "@app/lib/api/metronome/reconcile_credit_state";
import { setUserSpendLimit } from "@app/lib/api/users/spend_limit";
import { Authenticator } from "@app/lib/auth";
import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import { cleanAndFinalizeMetronomeDraftInvoice } from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";

const SET_SPEND_LIMIT_CONCURRENCY = 1;

export type SetSpendLimitChunkResult = {
  succeeded: number;
  failures: { userId: string; message: string }[];
};

// Apply a per-user spend limit to a chunk of members. Permanent failures (e.g.
// a member revoked between selection and run) are recorded; transient Metronome
// failures throw so Temporal retries the chunk (setUserSpendLimit is idempotent,
// so re-running already-applied members is a no-op).
export async function setSpendLimitForUsersActivity({
  workspaceId,
  actorUserId,
  userIds,
  limit,
}: {
  workspaceId: string;
  actorUserId: string;
  userIds: string[];
  limit: UserSpendLimit;
}): Promise<SetSpendLimitChunkResult> {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    actorUserId,
    workspaceId
  );
  const auditContext = getAuditLogContext(auth);

  const failures: { userId: string; message: string }[] = [];
  const transientFailures: { userId: string; message: string }[] = [];
  let succeeded = 0;

  await concurrentExecutor(
    userIds,
    async (userId) => {
      const result = await setUserSpendLimit(auth, {
        userId,
        limit,
        auditContext,
      });
      if (result.isOk()) {
        succeeded++;
        return;
      }
      const failure = { userId, message: result.error.message };
      if (result.error.type === "metronome_error") {
        transientFailures.push(failure);
      } else {
        failures.push(failure);
      }
      logger.error(
        { workspaceId, userId, err: result.error },
        "[BulkSpendLimit] Failed to set spend limit for member"
      );
    },
    { concurrency: SET_SPEND_LIMIT_CONCURRENCY }
  );

  // Throw after the executor so every member is attempted and permanent failures
  // are still recorded on the final (exhausted) attempt.
  if (transientFailures.length > 0) {
    throw new Error(
      `[BulkSpendLimit] ${transientFailures.length} transient failure(s) setting spend limit; retrying. ` +
        `First: ${transientFailures[0].userId}: ${transientFailures[0].message}`
    );
  }

  return { succeeded, failures };
}

/**
 * Temporal wrapper around `processMetronomeWebhook`. The handler has already
 * verified the workspace exists, but we re-fetch it here by sId so the
 * activity owns its workspace handle (Temporal args must be serializable, and
 * the workspace may have been mutated between handler and activity). Throws
 * on Result.Err so Temporal's retry policy can drive convergence — transient
 * failures (Metronome timeouts, DB hiccups, downstream API errors) retry
 * automatically with exponential backoff; permanent failures eventually mark
 * the workflow failed and let the next Metronome redelivery start a fresh one.
 */
export async function processMetronomeWebhookActivity({
  event,
  workspaceId,
}: {
  event: MetronomeWebhookEvent;
  workspaceId: string;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(
      `[Metronome Events] Workspace ${workspaceId} not found at activity start`
    );
  }
  const result = await processMetronomeWebhook({ event, workspace });
  if (result.isErr()) {
    throw result.error;
  }
}

/**
 * Cleans and finalizes a Metronome-pushed Stripe draft invoice. Scheduled with a
 * start delay (see the launcher) so Metronome has finished writing all line items
 * before we touch the draft. The underlying lib call is idempotent and re-asserts
 * draft + not-yet-cleaned, so Temporal retries are safe. Throws on Result.Err so
 * transient Stripe failures retry with backoff.
 */
export async function cleanMetronomeInvoiceActivity({
  invoiceId,
  workspaceId,
}: {
  invoiceId: string;
  workspaceId: string;
}): Promise<void> {
  const result = await cleanAndFinalizeMetronomeDraftInvoice({
    invoiceId,
    workspaceId,
  });
  if (result.isErr()) {
    throw new Error(result.error.error_message);
  }
}

/**
 * Reconcile per-user credit states for a workspace after a seat segment starts.
 * Extracted as a dedicated activity so it can be launched as a separate,
 * workspace-scoped workflow (see `reconcileWorkspaceCreditStatesWorkflow`) — this
 * lets Temporal deduplicate the N concurrent `credit.segment.start` events that
 * fire during a seat-type change (one per seat) down to a single execution per
 * workspace.
 *
 * Metronome at schedule time (via `syncSeatCount` with a future `startingAt`).
 * When `credit.segment.start` fires the assignment is already correct; we only
 * need to invalidate and recalculate each user's credit state.
 */
export async function reconcileWorkspaceUserCreditStatesActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw new Error(
      `[Metronome Reconcile] Workspace ${workspaceId} not found at activity start`
    );
  }
  if (!workspace.metronomeCustomerId) {
    return;
  }
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );
  if (!subscription?.metronomeContractId) {
    return;
  }
  await reconcileWorkspaceUserCreditStates({
    workspace: renderLightWorkspaceType({ workspace }),
    metronomeCustomerId: workspace.metronomeCustomerId,
    metronomeContractId: subscription.metronomeContractId,
    planCode: subscription.getPlan().code,
  });
}
