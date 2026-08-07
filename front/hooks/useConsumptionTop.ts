import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import { consumptionQueryString } from "@app/lib/analytics/consumption_period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import type { GetConsumptionTopAgentsResponse } from "@app/lib/api/analytics/consumption/top_agents";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import type { GetConsumptionTopSkillsResponse } from "@app/lib/api/analytics/consumption/top_skills";
import type { GetConsumptionTopSourcesResponse } from "@app/lib/api/analytics/consumption/top_sources";
import type { GetConsumptionTopTeamsResponse } from "@app/lib/api/analytics/consumption/top_teams";
import type { GetConsumptionTopToolsResponse } from "@app/lib/api/analytics/consumption/top_tools";
import type { GetConsumptionTopUsersResponse } from "@app/lib/api/analytics/consumption/top_users";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { AgentConfigurationScope } from "@app/types/assistant/agent";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useMemo } from "react";
import type { Fetcher } from "swr";

const CONSUMPTION_TOP_ENDPOINTS = {
  agent: "top-agents",
  user: "top-users",
  team: "top-teams",
  model: "top-models",
  tool: "top-tools",
  skill: "top-skills",
  source: "top-sources",
} as const satisfies Record<ConsumptionDimension, string>;

type ConsumptionTopRowBase = {
  id: string;
  name: string;
  pictureUrl: string | null;
  credits: number;
  avgCredits: number;
};

// `scope` only makes sense for the "agent" dimension, so it is tied to that
// dimension in the type itself rather than left as an optional field every
// dimension could accidentally set (or forget to set).
export type ConsumptionAgentTopRow = ConsumptionTopRowBase & {
  dimension: "agent";
  scope: AgentConfigurationScope;
};

export type ConsumptionTopRow =
  | ConsumptionAgentTopRow
  | (ConsumptionTopRowBase & {
      dimension: Exclude<ConsumptionDimension, "agent">;
    });

type ConsumptionTopResponse =
  | GetConsumptionTopAgentsResponse
  | GetConsumptionTopUsersResponse
  | GetConsumptionTopTeamsResponse
  | GetConsumptionTopModelsResponse
  | GetConsumptionTopToolsResponse
  | GetConsumptionTopSkillsResponse
  | GetConsumptionTopSourcesResponse;

// Narrowed on the collection each response carries rather than on the requested
// dimension, so a row shape that drifts from its endpoint is a type error here
// instead of a silently empty table.
function toRows(data: ConsumptionTopResponse): ConsumptionTopRow[] {
  if ("agents" in data) {
    return data.agents.map(
      (row): ConsumptionAgentTopRow => ({
        id: row.agentId,
        name: row.name,
        pictureUrl: row.pictureUrl,
        dimension: "agent",
        scope: row.scope,
        credits: row.credits,
        avgCredits: row.avgCreditsPerMessage,
      })
    );
  }
  if ("users" in data) {
    return data.users.map(
      (row): ConsumptionTopRow => ({
        id: row.userId,
        name: row.name,
        pictureUrl: row.pictureUrl,
        dimension: "user",
        credits: row.credits,
        avgCredits: row.avgCreditsPerMessage,
      })
    );
  }
  if ("teams" in data) {
    return data.teams.map((row) => ({
      id: row.teamId,
      name: row.name,
      pictureUrl: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
    }));
  }
  if ("models" in data) {
    return data.models.map(
      (row): ConsumptionTopRow => ({
        id: row.modelId,
        name: row.name,
        pictureUrl: null,
        dimension: "model",
        credits: row.credits,
        avgCredits: row.avgCreditsPerMessage,
      })
    );
  }
  if ("tools" in data) {
    return data.tools.map(
      (row): ConsumptionTopRow => ({
        id: row.serverName,
        name: row.name,
        pictureUrl: null,
        dimension: "tool",
        credits: row.credits,
        avgCredits: row.avgCreditsPerInvocation,
      })
    );
  }
  if ("skills" in data) {
    return data.skills.map(
      (row): ConsumptionTopRow => ({
        id: row.skillId,
        name: row.name,
        pictureUrl: null,
        dimension: "skill",
        credits: row.credits,
        avgCredits: row.avgCreditsPerInvocation,
      })
    );
  }
  if ("sources" in data) {
    return data.sources.map(
      (row): ConsumptionTopRow => ({
        id: row.source,
        name: row.name,
        pictureUrl: null,
        dimension: "source",
        credits: row.credits,
        avgCredits: row.avgCreditsPerMessage,
      })
    );
  }
  assertNeverAndIgnore(data);
  return [];
}

export function useConsumptionTop({
  workspaceId,
  dimension,
  period,
  limit,
  filter,
  disabled,
}: {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  limit: number;
  filter?: ConsumptionScopeFilter;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const topFetcher: Fetcher<ConsumptionTopResponse> = fetcher;

  const params = new URLSearchParams(consumptionQueryString(period, filter));
  params.set("limit", String(limit));

  const { data, error, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/analytics/consumption/` +
      `${CONSUMPTION_TOP_ENDPOINTS[dimension]}?${params.toString()}`,
    topFetcher,
    { disabled }
  );

  const rows = useMemo(
    () => (data ? toRows(data) : emptyArray<ConsumptionTopRow>()),
    [data]
  );

  return {
    rows,
    // Everything the workspace consumed over the period, so a row's share of it
    // is `credits / totalCredits`.
    totalCredits: data?.totalCredits ?? 0,
    isTopLoading: !error && !data && !disabled,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
