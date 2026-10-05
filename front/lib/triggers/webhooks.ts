import type {
  WebhookProvider,
  WebhookSourceSignatureAlgorithm,
} from "@app/types/triggers/webhooks";
import { z } from "zod";

export const WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS = [
  "sha1",
  "sha256",
  "sha512",
] as const satisfies readonly WebhookSourceSignatureAlgorithm[];

export const WEBHOOK_PROVIDERS = [
  "fathom",
  "github",
  "jira",
  "linear",
  "zendesk",
] as const satisfies readonly WebhookProvider[];

export function isWebhookProvider(
  provider: string
): provider is WebhookProvider {
  return WEBHOOK_PROVIDERS.some((value) => value === provider);
}

export const WebhookSourcesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Secret can be omitted or empty when auto-generated server-side.
  secret: z.string().nullable(),
  signatureHeader: z.string(),
  signatureAlgorithm: z.enum(WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS),
  includeGlobal: z.boolean().optional(),
  subscribedEvents: z.array(z.string()).default([]),
  provider: z.enum(WEBHOOK_PROVIDERS).nullable(),
  // Optional fields for creating remote webhooks
  connectionId: z.string().optional(),
  remoteMetadata: z.record(z.any()).optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
});

export const PostWebhookSourceViewBodySchema = z.object({
  webhookSourceId: z.string(),
});
