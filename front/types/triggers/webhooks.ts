import { z } from "zod";

import type { ModelId } from "@app/types/shared/model_id";
import type { EditedByUser } from "@app/types/user";

export const WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS = [
  "sha1",
  "sha256",
  "sha512",
] as const;

export type WebhookSourceSignatureAlgorithm =
  (typeof WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS)[number];

export type WebhookSourceType = {
  id: ModelId;
  sId: string;
  name: string;
  secret: string | null;
  signatureHeader: string | null;
  signatureAlgorithm: WebhookSourceSignatureAlgorithm | null;
  customHeaders: Record<string, string> | null;
  createdAt: number;
  updatedAt: number;
};

export type WebhookSourceViewType = {
  id: ModelId;
  sId: string;
  customName: string | null;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  webhookSource: WebhookSourceType;
  editedByUser: EditedByUser | null;
};

export type WebhookSourceWithViews = WebhookSourceType & {
  views: WebhookSourceViewType[];
};

export type PostWebhookSourcesBody = z.infer<typeof PostWebhookSourcesSchema>;

export const PostWebhookSourcesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  secret: z.string().min(1, "Secret is required"),
  signatureHeader: z.string().min(1, "Signature header is required"),
  signatureAlgorithm: z.enum(WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS),
  customHeaders: z.record(z.string(), z.string()).nullable(),
  includeGlobal: z.boolean().optional(),
});

export type PatchWebhookSourceViewBody = z.infer<
  typeof patchWebhookSourceViewBodySchema
>;

export const patchWebhookSourceViewBodySchema = z.object({
  name: z.string().min(1, "Name is required."),
});
