import type { Icon } from "@dust-tt/sparkle";
import { ActionGlobeAltIcon } from "@dust-tt/sparkle";
import { z } from "zod";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type { AgentsUsageType } from "@app/types/data_source";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";
import { GITHUB_WEBHOOK_PRESET } from "@app/types/triggers/github_webhook_source_presets";
import { TEST_WEBHOOK_PRESET } from "@app/types/triggers/test_webhook_source_presets";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";
import type { EditedByUser } from "@app/types/user";

export const WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS = [
  "sha1",
  "sha256",
  "sha512",
] as const;

export type WebhookSourceSignatureAlgorithm =
  (typeof WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS)[number];

export const WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP: Record<
  Exclude<WebhookSourceKind, "custom">,
  PresetWebhook
> & {
  custom: {
    name: string;
    icon: typeof Icon;
    featureFlag?: WhitelistableFeature;
  };
} = {
  github: GITHUB_WEBHOOK_PRESET,
  test: TEST_WEBHOOK_PRESET,
  custom: { name: "Custom", icon: ActionGlobeAltIcon },
} as const;

export const WEBHOOK_SOURCE_KIND = ["custom", "github", "test"] as const;

export type WebhookSourceKind = (typeof WEBHOOK_SOURCE_KIND)[number];

export type WebhookSource = {
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

export type WebhookSourceView = {
  id: ModelId;
  sId: string;
  customName: string | null;
  description: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  webhookSource: WebhookSource;
  editedByUser: EditedByUser | null;
};

export type WebhookSourceWithViews = WebhookSource & {
  views: WebhookSourceView[];
};

export type WebhookSourceWithSystemView = WebhookSourceWithViews & {
  systemView: WebhookSourceView | null;
};

export type WebhookSourceWithViewsAndUsage = WebhookSourceWithViews & {
  usage: AgentsUsageType | null;
};

export type WebhookSourceWithSystemViewAndUsage =
  WebhookSourceWithSystemView & {
    usage: AgentsUsageType | null;
  };

export const basePostWebhookSourcesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Secret can be omitted or empty when auto-generated server-side.
  secret: z.string().nullable(),
  signatureHeader: z.string(),
  signatureAlgorithm: z.enum(WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS),
  customHeaders: z.record(z.string(), z.string()).nullable(),
  includeGlobal: z.boolean().optional(),
  subscribedEvents: z.array(z.string()).default([]),
  kind: z.enum(WEBHOOK_SOURCE_KIND),
});

export const refineSubscribedEvents: [
  (data: { kind: WebhookSourceKind; subscribedEvents: string[] }) => boolean,
  {
    message: string;
    path: string[];
  },
] = [
  ({
    kind,
    subscribedEvents,
  }: {
    kind: WebhookSourceKind;
    subscribedEvents: string[];
  }) => kind === "custom" || subscribedEvents.length > 0,
  {
    message: "Subscribed events must not be empty.",
    path: ["subscribedEvents"],
  },
];

export const postWebhookSourcesSchema = basePostWebhookSourcesSchema.refine(
  ...refineSubscribedEvents
);

export type PostWebhookSourcesBody = z.infer<typeof postWebhookSourcesSchema>;

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
