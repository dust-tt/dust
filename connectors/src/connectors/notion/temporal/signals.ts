import { defineSignal } from "@temporalio/workflow";

export type NotionDeletionCrawlSignal = {
  resourceId: string;
  resourceType: "page" | "database";
};

export const notionDeletionCrawlSignal = defineSignal<
  [NotionDeletionCrawlSignal]
>("notion_deletion_crawl_signal");
