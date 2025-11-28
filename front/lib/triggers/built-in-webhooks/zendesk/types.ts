import { z } from "zod";

export const ZendeskWebhookStoredMetadataSchema = z.object({
  zendeskSubdomain: z.string().describe("The Zendesk subdomain"),
  webhookId: z.string().describe("The ID of the created Zendesk webhook"),
});

export type ZendeskWebhookStoredMetadata = z.infer<
  typeof ZendeskWebhookStoredMetadataSchema
>;
