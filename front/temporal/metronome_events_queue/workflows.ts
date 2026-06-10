import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import type * as activities from "@app/temporal/metronome_events_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const { processMetronomeWebhookActivity, cleanMetronomeInvoiceActivity } =
  proxyActivities<typeof activities>({
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
