import type { Icon } from "@dust-tt/sparkle";
import { GithubLogo, JiraLogo } from "@dust-tt/sparkle";

import type { RemoteWebhookService } from "@app/lib/triggers/services/remote_webhook_service";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

type EventFieldBase = {
  name: string;
  description: string;
};

export type EventField = EventFieldBase &
  (
    | {
        type: "string" | "number" | "boolean" | "array" | "null";
      }
    | {
        type: "enum";
        enumValues: string[];
      }
    | {
        type: "object";
        isArray: boolean;
        childrenFields: EventField[];
      }
  );

export type EventCheck = {
  type: "headers" | "body";
  field: string;
};

export type WebhookEvent = {
  name: string;
  value: string;
  description: string;
  fields: EventField[];
};

const WebhookPresetIcons = {
  GithubLogo,
  JiraLogo,
} as const;

export type WebhookPresetIcon =
  (typeof WebhookPresetIcons)[keyof typeof WebhookPresetIcons];

export type PresetWebhook = {
  name: string;
  eventCheck: EventCheck;
  events: WebhookEvent[];
  icon: typeof Icon;
  description: string;
  featureFlag?: WhitelistableFeature;
  webhookService: RemoteWebhookService;
};
