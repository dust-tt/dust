import { z } from "zod";

export const FathomWebhookOptionsSchema = z
  .object({
    include_transcript: z
      .boolean()
      .describe("Include meeting transcripts in webhook payloads"),
    include_summary: z
      .boolean()
      .describe("Include meeting summaries in webhook payloads"),
    include_action_items: z
      .boolean()
      .describe("Include action items in webhook payloads"),
    include_crm_matches: z
      .boolean()
      .describe("Include CRM matches in webhook payloads"),
  })
  .passthrough();

export const FathomAdditionalDataSchema = z.object({
  webhookOptions: FathomWebhookOptionsSchema,
  webhookId: z.string().optional(),
  webhookSecret: z.string().optional(),
});

export function isFathomWebhookOptions(
  data: unknown
): data is FathomWebhookOptions {
  const result = FathomWebhookOptionsSchema.safeParse(data);
  return result.success;
}

export function isFathomAdditionalData(
  data: unknown
): data is FathomAdditionalData {
  const result = FathomAdditionalDataSchema.safeParse(data);
  return result.success;
}

export type FathomWebhookOptions = z.infer<typeof FathomWebhookOptionsSchema>;
export type FathomAdditionalData = z.infer<typeof FathomAdditionalDataSchema>;
