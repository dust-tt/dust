import type { Icon } from "@dust-tt/sparkle";
import { GithubLogo, JiraLogo } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type React from "react";

import type {
  WebhookCreateFormComponentProps,
  WebhookDetailsComponentProps,
} from "@app/components/triggers/webhook_preset_components";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

export type EventCheck = {
  type: "headers" | "body";
  field: string;
};

export type WebhookEvent = {
  name: string;
  value: string;
  description: string;
  schema: JSONSchema;
};

const WebhookPresetIcons = {
  GithubLogo,
  JiraLogo,
} as const;

export type WebhookPresetIcon =
  (typeof WebhookPresetIcons)[keyof typeof WebhookPresetIcons];

export type PresetWebhook<P extends WebhookProvider = WebhookProvider> = {
  name: string;
  eventCheck: EventCheck;
  events: WebhookEvent[];
  icon: typeof Icon;
  description: string;
  webhookPageUrl?: string;
  featureFlag?: WhitelistableFeature;
  webhookService: RemoteWebhookService<P>;
  components: {
    detailsComponent: React.ComponentType<WebhookDetailsComponentProps>;
    createFormComponent: React.ComponentType<WebhookCreateFormComponentProps>;
  };
};
