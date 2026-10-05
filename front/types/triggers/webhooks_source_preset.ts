import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { JSONSchema7 as JSONSchema } from "json-schema";

export type EventCheck = {
  type: "headers" | "body";
  field: string;
};

export type WebhookEventMetadata = {
  name: string;
  // The value sent by the webhook provider to identify this event.
  value: string;
  description: string;
};

export type WebhookEvent = WebhookEventMetadata & {
  // The JSON schema describing the payload sent by the webhook for this event.
  schema: JSONSchema;
  // Sample event shown to the model to help it generate a filter.
  sample: Record<string, unknown> | null;
};

export type WebhookPresetMetadata = {
  name: string;
  description: string;
  // The request header or body property used to identify the event value.
  eventCheck: EventCheck | null;
  events: WebhookEventMetadata[];
  // Events to ignore, such as GitHub's initial ping.
  event_blacklist?: string[];
  webhookPageUrl?: string;
  featureFlag?: WhitelistableFeature;
};

export type BaseWebhookPreset = Omit<WebhookPresetMetadata, "events"> & {
  events: WebhookEvent[];
  // Optional instructions to help the LLM generate filters for this provider.
  filterGenerationInstructions: string | null;
};
