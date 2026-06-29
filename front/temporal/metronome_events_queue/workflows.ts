import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import type * as activities from "@app/temporal/metronome_events_queue/activities";
import type { UserSpendLimit } from "@app/types/api/users/spend_limit";
import { log, proxyActivities } from "@temporalio/workflow";

const {
  processMetronomeWebhookActivity,
  cleanMetronomeInvoiceActivity,
  reconcileWorkspaceUserCreditStatesActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

// Bulk per-user spend-limit runs on this (Metronome) worker. Its activity makes
// Metronome calls, so it gets a tighter timeout and a retry policy of its own.
const { setSpendLimitForUsersActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 3,
    initialInterval: "2s",
    backoffCoefficient: 2,
    maximumInterval: "1m",
  },
});

export async function metronomeEventsWorkflow({
  event,
  workspaceId,
}: {
  event: MetronomeWebhookEvent;
  workspaceId: string;
}): Promise<void> {
  await processMetronomeWebhookActivity({ event, workspaceId });
}

/**
 * Cleans and finalizes a Metronome-pushed Stripe draft invoice. The launcher
 * defers the workflow start (via `startDelay`) so by the time this runs Metronome
 * has finished writing all line items — there is no `sleep` here on purpose.
 */
export async function cleanMetronomeInvoiceWorkflow({
  invoiceId,
  workspaceId,
}: {
  invoiceId: string;
  workspaceId: string;
}): Promise<void> {
  await cleanMetronomeInvoiceActivity({ invoiceId, workspaceId });
}
/**
 * Dedicated workflow for reconciling per-user credit states after a seat segment
 * starts. Using a separate workflow (rather than calling reconcile inline in
 * `metronomeEventsWorkflow`) lets us assign a stable, workspace-scoped workflow
 * ID and set `WorkflowIdConflictPolicy.USE_EXISTING` — so the N concurrent
 * `credit.segment.start` events fired during a seat-type change collapse to a
 * single execution instead of hammering the DB N times.
 */
export async function reconcileWorkspaceUserCreditStatesWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await reconcileWorkspaceUserCreditStatesActivity({ workspaceId });
}

const BULK_SPEND_LIMIT_CHUNK_SIZE = 25;

export async function bulkSetUserSpendLimitWorkflow({
  workspaceId,
  actorUserId,
  userIds,
  limit,
}: {
  workspaceId: string;
  actorUserId: string;
  userIds: string[];
  limit: UserSpendLimit;
}): Promise<void> {
  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < userIds.length; i += BULK_SPEND_LIMIT_CHUNK_SIZE) {
    const chunk = userIds.slice(i, i + BULK_SPEND_LIMIT_CHUNK_SIZE);
    const result = await setSpendLimitForUsersActivity({
      workspaceId,
      actorUserId,
      userIds: chunk,
      limit,
    });
    succeeded += result.succeeded;
    failed += result.failures.length;
  }

  log.info("[BulkSpendLimit] Completed bulk spend-limit update", {
    workspaceId,
    total: userIds.length,
    succeeded,
    failed,
  });
}
