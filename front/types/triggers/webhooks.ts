import { z } from "zod";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import { FATHOM_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/fathom/preset";
import { GITHUB_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/github/preset";
import type { GithubAdditionalData } from "@app/lib/triggers/built-in-webhooks/github/types";
import { JIRA_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/jira/preset";
import type { JiraAdditionalData } from "@app/lib/triggers/built-in-webhooks/jira/types";
import { LINEAR_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/linear/preset";
import type { LinearAdditionalData } from "@app/lib/triggers/built-in-webhooks/linear/types";
import { ZENDESK_WEBHOOK_PRESET } from "@app/lib/triggers/built-in-webhooks/zendesk/preset";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { PresetWebhook } from "@app/types/triggers/webhooks_source_preset";
import type { EditedByUser } from "@app/types/user";

export const WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS = [
  "sha1",
  "sha256",
  "sha512",
] as const;

export type WebhookSourceSignatureAlgorithm =
  (typeof WEBHOOK_SOURCE_SIGNATURE_ALGORITHMS)[number];

export const WEBHOOK_PROVIDERS = [
  "fathom",
  "github",
  "jira",
  "linear",
  "zendesk",
] as const;

export type WebhookProvider = (typeof WEBHOOK_PROVIDERS)[number];

export function isWebhookProvider(
  provider: string
): provider is WebhookProvider {
  return WEBHOOK_PROVIDERS.includes(provider as WebhookProvider);
}

export const NoAdditionalDataSchema = z.object({});
export type NoAdditionalData = z.infer<typeof NoAdditionalDataSchema>;

type WebhookProviderServiceDataMap = {
  fathom: NoAdditionalData;
  github: GithubAdditionalData;
  jira: JiraAdditionalData;
  linear: LinearAdditionalData;
  zendesk: NoAdditionalData;
};

export type WebhookServiceDataForProvider<P extends WebhookProvider> =
  WebhookProviderServiceDataMap[P];

export const WEBHOOK_PRESETS = {
  fathom: FATHOM_WEBHOOK_PRESET,
  github: GITHUB_WEBHOOK_PRESET,
  jira: JIRA_WEBHOOK_PRESET,
  linear: LINEAR_WEBHOOK_PRESET,
  zendesk: ZENDESK_WEBHOOK_PRESET,
} satisfies {
  [P in WebhookProvider]: PresetWebhook<P>;
};

export type WebhookSourceType = {
  id: ModelId;
  sId: string;
  name: string;
  provider: WebhookProvider | null;
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
  provider: WebhookProvider | null;
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
