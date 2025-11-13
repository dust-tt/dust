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
const MAX_EVENTS_BEFORE_CONTINUE_AS_NEW = 4000;

// Long-running workflow that processes Notion webhook events.
// Auto-terminates if no events arrive for 5 minutes.
export async function notionProcessWebhooksWorkflow({
  connectorId,
  eventQueue = [],
}: {
  connectorId: ModelId;
  eventQueue?: NotionWebhookEvent[];
}) {
  let processedCount = 0;

  setHandler(notionWebhookSignal, (event: NotionWebhookEvent) => {
    eventQueue.push(event);
  });

  for (;;) {
    // Wait for an event, but stop the workflow if no events arrive for 5 minutes.
    if (!(await condition(() => eventQueue.length > 0, "5 minutes"))) {
      return;
    }

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

    // After we reach our max, call continueAsNew() to limit history growth.
    if (processedCount > MAX_EVENTS_BEFORE_CONTINUE_AS_NEW) {
      await continueAsNew({ connectorId, eventQueue });
      return;
    }
  }
}
