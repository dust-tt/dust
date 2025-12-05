import type { TriggeredFor } from "fathom-typescript/sdk/models/shared";

type FathomWebhookMetadata = {
  webhookId: string;
  triggered_for: TriggeredFor[];
  include_transcript: boolean;
  include_summary: boolean;
  include_action_items: boolean;
  include_crm_matches: boolean;
};

type FathomWebhookCreateMetadata = {
  triggered_for: TriggeredFor[];
  include_transcript: boolean;
  include_summary: boolean;
  include_action_items: boolean;
  include_crm_matches: boolean;
};

const VALID_TRIGGERED_FOR_VALUES = [
  "my_recordings",
  "shared_external_recordings",
  "my_shared_with_team_recordings",
  "shared_team_recordings",
] as const;

function isTriggeredForValue(value: unknown): value is TriggeredFor {
  return (
    typeof value === "string" &&
    VALID_TRIGGERED_FOR_VALUES.includes(value as TriggeredFor)
  );
}

function isTriggeredForArray(value: unknown): value is TriggeredFor[] {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isTriggeredForValue)
  );
}

export function isFathomWebhookCreateMetadata(
  metadata: Record<string, unknown>
): metadata is FathomWebhookCreateMetadata {
  return (
    isTriggeredForArray(metadata.triggered_for) &&
    typeof metadata.include_transcript === "boolean" &&
    typeof metadata.include_summary === "boolean" &&
    typeof metadata.include_action_items === "boolean" &&
    typeof metadata.include_crm_matches === "boolean"
  );
}

export function isFathomWebhookMetadata(
  metadata: Record<string, unknown>
): metadata is FathomWebhookMetadata {
  return (
    typeof metadata.webhookId === "string" &&
    isFathomWebhookCreateMetadata(metadata)
  );
}
