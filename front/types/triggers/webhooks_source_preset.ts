import type { Icon } from "@dust-tt/sparkle";
import { GithubLogo, JiraLogo } from "@dust-tt/sparkle";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type React from "react";

import type {
  WebhookCreateFormComponentProps,
  WebhookDetailsComponentProps,
} from "@app/components/triggers/webhook_preset_components";
import type { RemoteWebhookService } from "@app/lib/triggers/services/remote_webhook_service";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

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

export type PresetWebhook<TServiceData = Record<string, unknown>> = {
  name: string;
  eventCheck: EventCheck;
  events: WebhookEvent[];
  icon: typeof Icon;
  description: string;
  featureFlag?: WhitelistableFeature;
  webhookService: RemoteWebhookService<TServiceData>;
  components: {
    detailsComponent: React.ComponentType<WebhookDetailsComponentProps>;
    createFormComponent: React.ComponentType<
      WebhookCreateFormComponentProps<TServiceData>
    >;
  };
};

// Helper type to extract the service data type from a PresetWebhook
export type ExtractServiceData<T> =
  T extends PresetWebhook<infer TServiceData> ? TServiceData : never;

// Helper type to extract union of all PresetWebhook instances from a map
export type ExtractAllPresets<TMap> = {
  [K in keyof TMap]: TMap[K] extends PresetWebhook<any> ? TMap[K] : never;
}[keyof TMap];
