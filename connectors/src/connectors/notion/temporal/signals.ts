import { defineSignal } from "@temporalio/workflow";

export type NotionWebhookEvent = {
  workspace_id: string;
  type: string;
  entity?: {
    id: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export const notionWebhookSignal = defineSignal<[NotionWebhookEvent]>(
  "notion_webhook_signal"
);
