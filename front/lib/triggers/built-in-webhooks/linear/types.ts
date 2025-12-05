import { z } from "zod";

const LinearTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
});

export type LinearTeam = z.infer<typeof LinearTeamSchema>;

const LinearAdditionalDataSchema = z.object({
  teams: z.array(LinearTeamSchema),
});

export type LinearAdditionalData = z.infer<typeof LinearAdditionalDataSchema>;

function isLinearTeam(data: unknown): data is LinearTeam {
  const result = LinearTeamSchema.safeParse(data);
  return result.success;
}

type LinearWebhookCreateMetadata = {
  teams: LinearTeam[];
};

type LinearWebhookMetadata = {
  webhookIds: Record<string, string>;
  teams?: LinearTeam[];
};

export function isLinearWebhookCreateMetadata(
  metadata: Record<string, unknown>
): metadata is LinearWebhookCreateMetadata {
  return (
    Array.isArray(metadata.teams) &&
    metadata.teams.length > 0 &&
    metadata.teams.every((team: unknown) => isLinearTeam(team))
  );
}

export function isLinearWebhookMetadata(
  metadata: Record<string, unknown>
): metadata is LinearWebhookMetadata {
  return (
    typeof metadata.webhookIds === "object" && metadata.webhookIds !== null
  );
}
