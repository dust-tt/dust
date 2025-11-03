import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";

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
  let processedCount = 0;

  setHandler(notionWebhookSignal, (event: NotionWebhookEvent) => {
    eventQueue.push(event);
  });

  for (;;) {
    // Wait until at least one event is present; wakes instantly on signal
    await condition(() => eventQueue.length > 0);

    // Drain the queue before waiting again
    while (eventQueue.length > 0) {
      const event = eventQueue.shift();
      if (event) {
        await processWebhookEventActivity({
          connectorId,
          event,
        });
        processedCount++;
      }
    }

    // After 4000 events, call continueAsNew() to limit history growth
    if (processedCount > 4000) {
      await continueAsNew({ connectorId });
      return;
    }
  }
}
