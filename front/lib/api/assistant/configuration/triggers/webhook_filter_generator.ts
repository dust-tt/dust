// Contract types and schemas for the webhook filter generator endpoint.
import { WEBHOOK_PROVIDERS } from "@app/types/triggers/webhooks";
import { z } from "zod";

export const PostWebhookFilterGeneratorResponseBodySchema = z.object({
  filter: z.string(),
});
export type PostWebhookFilterGeneratorResponseBody = z.infer<
  typeof PostWebhookFilterGeneratorResponseBodySchema
>;

export const PostWebhookFilterGeneratorRequestBodySchema = z.object({
  naturalDescription: z.string(),
  event: z.string(),
  provider: z.enum(WEBHOOK_PROVIDERS),
});

export type PostWebhookFilterGeneratorRequestBody = z.infer<
  typeof PostWebhookFilterGeneratorRequestBodySchema
>;
