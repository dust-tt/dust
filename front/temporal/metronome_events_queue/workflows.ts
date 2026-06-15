import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import type * as activities from "@app/temporal/metronome_events_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const {
  processMetronomeWebhookActivity,
  cleanMetronomeInvoiceActivity,
  reconcileWorkspaceUserCreditStatesActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
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
