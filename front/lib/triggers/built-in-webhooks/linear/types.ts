export type LinearTeam = {
  id: string;
  name: string;
  key: string;
};

export type LinearAdditionalData = {
  teams: LinearTeam[];
};

export type LinearWebhookMetadata = {
  webhookIds: Record<string, string>; // teamId -> webhookId
  teams?: LinearTeam[]; // Keep teams for display purposes.
};

export type LinearWebhookCreateMetadata = {
  teams: LinearTeam[];
};

export function isLinearWebhookCreateMetadata(
  metadata: Record<string, unknown>
): metadata is LinearWebhookCreateMetadata {
  return Array.isArray(metadata.teams) && metadata.teams.length > 0;
}

export function isLinearWebhookMetadata(
  metadata: Record<string, unknown>
): metadata is LinearWebhookMetadata {
  return (
    typeof metadata.webhookIds === "object" && metadata.webhookIds !== null
  );
}
