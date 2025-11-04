import { defineSignal } from "@temporalio/workflow";

export type NotionWebhookEvent = {
  type: string;
  entity_id: string;
};

export const notionWebhookSignal = defineSignal<[NotionWebhookEvent]>(
  "notion_webhook_signal"
);
