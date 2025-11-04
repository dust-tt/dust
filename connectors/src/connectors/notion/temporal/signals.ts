import { defineSignal } from "@temporalio/workflow";

export type NotionWebhookEventPayload = {
  workspace_id: string;
  type: string;
  entity?: {
    id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type NotionWebhookEvent = {
  type: string;
  entity_id: string;
};

export const notionWebhookSignal = defineSignal<[NotionWebhookEvent]>(
  "notion_webhook_signal"
);
