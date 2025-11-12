import { defineSignal } from "@temporalio/workflow";

export type NotionWebhookEvent = {
  type: "data_source.deleted" | "page.deleted";
  entity_id: string;
};

export const notionWebhookSignal = defineSignal<[NotionWebhookEvent]>(
  "notion_webhook_signal"
);

export type NotionDeletionCrawlSignal = {
  resourceId: string;
  resourceType: "page" | "database";
};

export const notionDeletionCrawlSignal = defineSignal<
  [NotionDeletionCrawlSignal]
>("notion_deletion_crawl_signal");
