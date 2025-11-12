import { defineSignal } from "@temporalio/workflow";
import { z } from "zod";

import logger from "@connectors/logger/logger";

export type NotionWebhookEvent = {
  type: "database.deleted" | "page.deleted";
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

/**
 * Zod schema for validating deletion crawl signal arguments
 * Validates connectorId, resourceId, and resourceType together
 */
export const DeletionCrawlSignalArgsSchema = z.object({
  connectorId: z
    .number()
    .int("Connector ID must be an integer")
    .positive("Connector ID must be positive"),
  resourceId: z.string().min(1, "Resource ID cannot be empty").trim(),
  resourceType: z.enum(["page", "database"], {
    errorMap: () => ({ message: "Resource type must be 'page' or 'database'" }),
  }),
});

/**
 * Type definition for deletion crawl signal arguments (inferred from schema)
 */
export type DeletionCrawlSignalArgs = z.infer<
  typeof DeletionCrawlSignalArgsSchema
>;

/**
 * Validates deletion crawl signal arguments using Zod schema
 * @param args - The arguments to validate
 * @returns Validated arguments or null if validation fails
 */
export function validateDeletionCrawlSignalArgs(
  args: unknown
): DeletionCrawlSignalArgs | null {
  const result = DeletionCrawlSignalArgsSchema.safeParse(args);
  if (!result.success) {
    logger.warn(
      { error: result.error.flatten(), receivedArgs: args },
      "Invalid deletion crawl signal arguments"
    );
    return null;
  }
  return result.data;
}
