import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import type * as activities from "@app/temporal/metronome_events_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const { processMetronomeWebhookActivity, syncMetronomeSeatCountActivity } =
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
 * Dedicated workflow for syncing a workspace's Metronome seat count. Using a
 * separate workflow (rather than calling the sync inline in
 * `metronomeEventsWorkflow`) lets us assign a stable, workspace-scoped workflow
 * ID and set `WorkflowIdConflictPolicy.USE_EXISTING` — so the N concurrent
 * `credit.segment.start` events fired during a seat-type upgrade collapse to a
 * single execution instead of hammering Metronome and the DB N times.
 */
export async function syncMetronomeSeatCountWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await syncMetronomeSeatCountActivity({ workspaceId });
}
