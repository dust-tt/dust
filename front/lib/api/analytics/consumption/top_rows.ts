import type { GetConsumptionTopAgentsResponse } from "@app/lib/api/analytics/consumption/top_agents";
import type { GetConsumptionTopGroupsResponse } from "@app/lib/api/analytics/consumption/top_groups";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import type { GetConsumptionTopSkillsResponse } from "@app/lib/api/analytics/consumption/top_skills";
import type { GetConsumptionTopSourcesResponse } from "@app/lib/api/analytics/consumption/top_sources";
import type { GetConsumptionTopToolsResponse } from "@app/lib/api/analytics/consumption/top_tools";
import type { GetConsumptionTopUsersResponse } from "@app/lib/api/analytics/consumption/top_users";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

// Shared by the attribution table (client-side ranking) and the CSV export
// (server-side full breakdown): the per-dimension `top-*` endpoints return
// differently-shaped responses, normalized here to a common row.
//
// Imported by frontend code, so this file must only pull in types — never the
// `fetchConsumptionTop*` functions themselves, which drag Sequelize/
// Elasticsearch into the browser bundle. The dispatch table that calls them
// lives in `export.ts`, the only backend-only consumer that needs it.

export type ConsumptionTopRow = {
  id: string;
  name: string;
  pictureUrl: string | null;
  credits: number;
  avgCredits: number;
};

export type ConsumptionTopResponse =
  | GetConsumptionTopAgentsResponse
  | GetConsumptionTopUsersResponse
  | GetConsumptionTopGroupsResponse
  | GetConsumptionTopModelsResponse
  | GetConsumptionTopToolsResponse
  | GetConsumptionTopSkillsResponse
  | GetConsumptionTopSourcesResponse;

// Narrowed on the collection each response carries rather than on the requested
// dimension, so a row shape that drifts from its endpoint is a type error here
// instead of a silently empty table.
export function toConsumptionTopRows(
  data: ConsumptionTopResponse
): ConsumptionTopRow[] {
  if ("agents" in data) {
    return data.agents.map((row) => ({
      id: row.agentId,
      name: row.name,
      pictureUrl: row.pictureUrl,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
    }));
  }
  if ("users" in data) {
    return data.users.map((row) => ({
      id: row.userId,
      name: row.name,
      pictureUrl: row.pictureUrl,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
    }));
  }
  if ("groups" in data) {
    return data.groups.map((row) => ({
      id: row.groupId,
      name: row.name,
      pictureUrl: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
    }));
  }
  if ("models" in data) {
    return data.models.map((row) => ({
      id: row.modelId,
      name: row.name,
      pictureUrl: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
    }));
  }
  if ("tools" in data) {
    return data.tools.map((row) => ({
      id: row.serverName,
      name: row.name,
      pictureUrl: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerInvocation,
    }));
  }
  if ("skills" in data) {
    return data.skills.map((row) => ({
      id: row.skillId,
      name: row.name,
      pictureUrl: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerInvocation,
    }));
  }
  if ("sources" in data) {
    return data.sources.map((row) => ({
      id: row.source,
      name: row.name,
      pictureUrl: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
    }));
  }
  assertNeverAndIgnore(data);
  return [];
}
