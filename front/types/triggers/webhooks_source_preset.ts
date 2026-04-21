import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/components/resources/resources_icon_names";
import type {
  WebhookCreateFormComponentProps,
  WebhookDetailsComponentProps,
} from "@app/components/triggers/webhook_preset_components";
import type { ConnectorOauthExtraConfigProps } from "@app/lib/connector_providers_ui";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import type React from "react";

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

// Data-only preset type. Safe for server-side / temporal worker code that
// does not render anything. Must not contain UI-only fields (icons, React
// components) so it can be imported from non-UI bundles.
export type BaseWebhookPreset = {
  name: string;
  description: string;

  // How to check incoming webhook requests to determine which event they correspond to.
  // It's made of a type (headers or body) and a field (header name or body property name)
  // to match against the event values defined below.
  // For example, GitHub uses a specific header "X-GitHub-Event" to indicate the event type.
  eventCheck: EventCheck | null;
  events: WebhookEvent[];

  // Optional instructions to help the LLM generate better webhook filters for this provider.
  filterGenerationInstructions: string | null;
  // List of event values to ignore. For example, GitHub sends a "ping" event when a webhook is created.
  // We will not want to implement it, and don't want to throw errors when receiving it.
  event_blacklist?: string[];

  // Optional URL to the webhook provider's webhook management page.
  webhookPageUrl?: string;

  featureFlag?: WhitelistableFeature;
};

// Full preset type including everything the UI needs (icon + React components).
// Import this (and CLIENT_SIDE_WEBHOOK_PRESETS) from client code.
export type ClientSideWebhookPreset = BaseWebhookPreset & {
  icon: InternalAllowedIconType | CustomResourceIconType;

  // React components to render the webhook details and creation form.
  components: {
    detailsComponent: React.ComponentType<WebhookDetailsComponentProps>;
    createFormComponent: React.ComponentType<WebhookCreateFormComponentProps>;
    oauthExtraConfigInput?: React.ComponentType<ConnectorOauthExtraConfigProps>;
  };
};
