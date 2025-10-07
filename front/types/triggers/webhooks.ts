import { z } from "zod";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { EditedByUser } from "@app/types/user";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";

import { GITHUB_WEBHOOK_PRESET } from "@app/types/triggers/github_webhook_source_presets";

export const WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS = [
  "sha1",
  "sha256",
  "sha512",
] as const;

export type WebhookSourceSignatureAlgorithm =
  (typeof WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS)[number];

export const WEBHOOK_SOURCE_PRESETS_MAP: Record<string, PresetWebhook> = {
  github: GITHUB_WEBHOOK_PRESET,
} as const;

export const WEBHOOK_SOURCE_KIND = [
  "custom",
  ...Object.keys(WEBHOOK_SOURCE_PRESETS_MAP),
] as const;

export type WebhookSourceKind = (typeof WEBHOOK_SOURCE_KIND)[number];

export type WebhookSourceType = {
  id: ModelId;
  sId: string;
  name: string;
  urlSecret: string;
  kind: WebhookSourceKind;
  secret: string | null;
  signatureHeader: string | null;
  signatureAlgorithm: WebhookSourceSignatureAlgorithm | null;
  customHeaders: Record<string, string> | null;
  createdAt: number;
  updatedAt: number;
  subscribedEvents: string[];
};

export type WebhookSourceViewType = {
  id: ModelId;
  sId: string;
  customName: string | null;
  description: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  webhookSource: WebhookSourceType;
  editedByUser: EditedByUser | null;
};

export type WebhookSourceWithViews = WebhookSourceType & {
  views: WebhookSourceViewType[];
};

export type WebhookSourceWithSystemView = WebhookSourceWithViews & {
  systemView: WebhookSourceViewType | null;
};

export type WebhookSourceWithViewsAndUsage = WebhookSourceWithViews & {
  usage: AgentsUsageType | null;
};

export type WebhookSourceWithSystemViewAndUsage =
  WebhookSourceWithSystemView & {
    usage: AgentsUsageType | null;
  };

export type PostWebhookSourcesBody = z.infer<typeof PostWebhookSourcesSchema>;

export const PostWebhookSourcesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Secret can be omitted or empty when auto-generated server-side.
  secret: z.string().nullable(),
  signatureHeader: z.string(),
  signatureAlgorithm: z.enum(WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS),
  customHeaders: z.record(z.string(), z.string()).nullable(),
  includeGlobal: z.boolean().optional(),
});

export type PatchWebhookSourceViewBody = z.infer<
  typeof patchWebhookSourceViewBodySchema
>;

export const patchWebhookSourceViewBodySchema = z.object({
  name: z.string().min(1, "Name is required."),
  description: z
    .string()
    .max(4000, "Description must be at most 4000 characters.")
    .optional(),
  icon: z.string().optional(),
});
