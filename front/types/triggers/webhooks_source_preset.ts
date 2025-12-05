import type { JSONSchema7 as JSONSchema } from "json-schema";
import type React from "react";

import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icons";
import type {
  WebhookCreateFormComponentProps,
  WebhookDetailsComponentProps,
} from "@app/components/triggers/webhook_preset_components";
import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers_ui";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { RemoteWebhookService } from "@app/types/triggers/remote_webhook_service";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

export type EventCheck = {
  type: "headers" | "body";
  field: string;
};

export type WebhookEvent = {
  // A human-readable name for the event.
  name: string;

  // The value sent by the webhook provider to identify this event.
  value: string;
  description: string;

  // The JSON schema describing the payload sent by the webhook for this event.
  schema: JSONSchema;

  // Sample event that will be shown to the model to help it generate a filter.
  sample: Record<string, unknown> | null;
};

export type PresetWebhook<P extends WebhookProvider = WebhookProvider> = {
  name: string;
  description: string;
  icon: InternalAllowedIconType | CustomResourceIconType;

  // How to check incoming webhook requests to determine which event they correspond to.
  // It's made of a type (headers or body) and a field (header name or body property name)
  // to match against the event values defined below.
  // For example, GitHub uses a specific header "X-GitHub-Event" to indicate the event type.
  eventCheck: EventCheck | null;
  events: WebhookEvent[];
  // List of event values to ignore. For example, GitHub sends a "ping" event when a webhook is created.
  // We will not want to implement it, and don't want to throw errors when receiving it.
  event_blacklist?: string[];

  // Optional URL to the webhook provider's webhook management page.
  webhookPageUrl?: string;

  // The service that will handle creating the webhooks for a given provider.
  // Likely implements OAuth flow to manage webhooks on behalf of users.
  webhookService: RemoteWebhookService<P>;

  // React components to render the webhook details and creation form.
  components: {
    detailsComponent: React.ComponentType<WebhookDetailsComponentProps>;
    createFormComponent: React.ComponentType<WebhookCreateFormComponentProps>;
    oauthExtraConfigInput?: React.ComponentType<ConnectorOauthExtraConfigProps>;
  };

  featureFlag?: WhitelistableFeature;
};
