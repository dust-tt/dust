import {
  condition,
  continueAsNew,
  executeChild,
  ParentClosePolicy,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type { NotionWebhookEvent } from "@connectors/connectors/notion/temporal/signals";
import { notionWebhookSignal } from "@connectors/connectors/notion/temporal/signals";
import { upsertPageChildWorkflow } from "@connectors/connectors/notion/temporal/workflows/children";
import type { ModelId } from "@connectors/types";

const MAX_EVENTS_BEFORE_CONTINUE_AS_NEW = 4000;

// Long-running workflow that processes Notion webhook events.
// Auto-terminates if no events arrive for 5 minutes.
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
    // Wait for an event, but stop the workflow if no events arrive for 5 minutes.
    if (!(await condition(() => eventQueue.length > 0, "5 minutes"))) {
      return;
    }

    while (eventQueue.length > 0) {
      const event = eventQueue.shift();
      if (event) {
        await processWebhookEvent({
          connectorId,
          event,
          processedCount,
        });
        processedCount++;
      }
    }

    // After we reach our max, call continueAsNew() to limit history growth.
    if (processedCount > MAX_EVENTS_BEFORE_CONTINUE_AS_NEW) {
      await continueAsNew({ connectorId });
      return;
    }
  }
}

async function processWebhookEvent({
  connectorId,
  event,
  processedCount,
}: {
  connectorId: ModelId;
  event: NotionWebhookEvent;
  processedCount: number;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  // Handle page.content_updated events
  if (event.type === "page.content_updated") {
    const pageId = event.entity?.id;
    if (!pageId) {
      // Log error but don't throw - we want to continue processing other events
      return;
    }

    // Remove dashes from the Notion page ID
    const normalizedPageId = pageId.replace(/-/g, "");

    // Use the existing upsertPageChildWorkflow to handle the page upsert
    await executeChild(upsertPageChildWorkflow, {
      workflowId: `${topLevelWorkflowId}-webhook-page-${normalizedPageId}-${processedCount}`,
      args: [
        {
          connectorId,
          pageId: normalizedPageId,
          runTimestamp: Date.now(),
          isBatchSync: false,
          pageIndex: processedCount,
          topLevelWorkflowId,
        },
      ],
      searchAttributes: {
        connectorId: [connectorId],
      },
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_TERMINATE,
      memo: workflowInfo().memo,
    });
  }
  // TODO: Handle other event types (database.content_updated, etc.)
}
