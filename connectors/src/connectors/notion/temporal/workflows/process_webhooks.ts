import { proxyActivities, setHandler, sleep } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import type { NotionWebhookEvent } from "@connectors/connectors/notion/temporal/signals";
import { notionWebhookSignal } from "@connectors/connectors/notion/temporal/signals";
import type { ModelId } from "@connectors/types";

const { processWebhookEventActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

// This is a long-running workflow that processes Notion webhook events.
// It receives events via signals and processes them using an activity.
export async function notionProcessWebhooksWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const eventQueue: NotionWebhookEvent[] = [];

  // Set up signal handler to receive webhook events
  setHandler(notionWebhookSignal, (event: NotionWebhookEvent) => {
    eventQueue.push(event);
  });

  // Loop forever, processing events from the queue
  // REVIEW: should we use continueAsNew pattern here to avoid long history?
  while (true) {
    if (eventQueue.length > 0) {
      const event = eventQueue.shift();
      if (event) {
        await processWebhookEventActivity({
          connectorId,
          event,
        });
      }
    } else {
      await sleep("10 seconds");
    }
  }
}
