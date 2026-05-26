import type { MetronomeWebhookEvent } from "@app/lib/metronome/webhook_events";
import type * as activities from "@app/temporal/metronome_events_queue/activities";
import { proxyActivities } from "@temporalio/workflow";

const { processMetronomeWebhookActivity } = proxyActivities<typeof activities>({
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
