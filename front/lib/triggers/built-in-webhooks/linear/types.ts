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
  allPublicTeams?: boolean;
  teams?: LinearTeam[]; // Keep teams for display purposes.
};

export type LinearWebhookCreateMetadata = {
  teams: LinearTeam[];
  allPublicTeams?: boolean;
};

export function isLinearWebhookCreateMetadata(
  metadata: Record<string, unknown>
): metadata is LinearWebhookCreateMetadata {
  return (
    Array.isArray(metadata.teams) &&
    (metadata.teams.length > 0 || metadata.allPublicTeams === true)
  );
}

export function isLinearWebhookMetadata(
  metadata: Record<string, unknown>
): metadata is LinearWebhookMetadata {
  return (
    typeof metadata.webhookIds === "object" && metadata.webhookIds !== null
  );
}
