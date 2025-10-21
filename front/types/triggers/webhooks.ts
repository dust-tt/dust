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

export type WebhookSourceType = {
  id: ModelId;
  sId: string;
  name: string;
  kind: WebhookSourceKind;
  createdAt: number;
  updatedAt: number;
  subscribedEvents: string[];
};

export type WebhookSourceForAdminType = WebhookSourceType & {
  urlSecret: string;
  secret: string | null;
  signatureHeader: string | null;
  signatureAlgorithm: WebhookSourceSignatureAlgorithm | null;
  remoteMetadata: Record<string, any> | null;
  oauthConnectionId: string | null;
};

type BaseWebhookSourceViewType = {
  id: ModelId;
  sId: string;
  customName: string;
  description: string;
  icon: InternalAllowedIconType | CustomResourceIconType;
  kind: WebhookSourceKind;
  subscribedEvents: string[];
  createdAt: number;
  updatedAt: number;
  spaceId: string;
  editedByUser: EditedByUser | null;
};
export type WebhookSourceViewType = BaseWebhookSourceViewType & {
  webhookSource: WebhookSourceType;
};

export type WebhookSourceViewForAdminType = BaseWebhookSourceViewType & {
  webhookSource: WebhookSourceForAdminType;
};

export type WebhookSourceWithViewsType = WebhookSourceForAdminType & {
  views: WebhookSourceViewForAdminType[];
};

export type WebhookSourceWithSystemViewType = WebhookSourceWithViewsType & {
  systemView: WebhookSourceViewForAdminType | null;
};

export type WebhookSourceWithViewsAndUsageType = WebhookSourceWithViewsType & {
  usage: AgentsUsageType | null;
};

export type WebhookSourceWithSystemViewAndUsageType =
  WebhookSourceWithSystemViewType & {
    usage: AgentsUsageType | null;
  };

export const basePostWebhookSourcesSchema = z.object({
  name: z.string().min(1, "Name is required"),
  // Secret can be omitted or empty when auto-generated server-side.
  secret: z.string().nullable(),
  signatureHeader: z.string(),
  signatureAlgorithm: z.enum(WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS),
  includeGlobal: z.boolean().optional(),
  subscribedEvents: z.array(z.string()).default([]),
  kind: z.enum(WEBHOOK_SOURCE_KIND),
  // Optional fields for creating remote webhooks
  connectionId: z.string().optional(),
  remoteMetadata: z.record(z.any()).optional(),
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
