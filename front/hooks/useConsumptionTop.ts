import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import { useConsumptionQuery } from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionTopBody } from "@app/lib/api/analytics/consumption/schema";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import type { GetConsumptionTopAgentsResponse } from "@app/lib/api/analytics/consumption/top_agents";
import type { GetConsumptionTopApiKeysResponse } from "@app/lib/api/analytics/consumption/top_api_keys";
import type { GetConsumptionTopGroupsResponse } from "@app/lib/api/analytics/consumption/top_groups";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import type { GetConsumptionTopSkillsResponse } from "@app/lib/api/analytics/consumption/top_skills";
import type { GetConsumptionTopSourcesResponse } from "@app/lib/api/analytics/consumption/top_sources";
import type { GetConsumptionTopToolsResponse } from "@app/lib/api/analytics/consumption/top_tools";
import type { GetConsumptionTopUsersResponse } from "@app/lib/api/analytics/consumption/top_users";
import { emptyArray } from "@app/lib/swr/swr";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useMemo } from "react";

const CONSUMPTION_TOP_ENDPOINTS = {
  agent: "top-agents",
  user: "top-users",
  group: "top-groups",
  model: "top-models",
  tool: "top-tools",
  skill: "top-skills",
  source: "top-sources",
  api_key: "top-api-keys",
} as const satisfies Record<ConsumptionDimension, string>;

export type ConsumptionTopRow = {
  id: string;
  name: string;
  pictureUrl: string | null;
  description: string | null;
  icon: string | null;
  modelId: string | null;
  modelDisplayName: string | null;
  credits: number;
  avgCredits: number;
  previousCredits: number | null;
};

type ConsumptionTopResponse =
  | GetConsumptionTopAgentsResponse
  | GetConsumptionTopUsersResponse
  | GetConsumptionTopGroupsResponse
  | GetConsumptionTopModelsResponse
  | GetConsumptionTopToolsResponse
  | GetConsumptionTopSkillsResponse
  | GetConsumptionTopSourcesResponse
  | GetConsumptionTopApiKeysResponse;

// Narrowed on the collection each response carries rather than on the requested
// dimension, so a row shape that drifts from its endpoint is a type error here
// instead of a silently empty table.
function toRows(data: ConsumptionTopResponse): ConsumptionTopRow[] {
  if ("agents" in data) {
    return data.agents.map((row) => ({
      id: row.agentId,
      name: row.name,
      pictureUrl: row.pictureUrl,
      description: row.description,
      icon: null,
      modelId: row.modelId,
      modelDisplayName: row.modelDisplayName,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
      previousCredits: row.previousCredits,
    }));
  }
  if ("users" in data) {
    return data.users.map((row) => ({
      id: row.userId,
      name: row.name,
      pictureUrl: row.pictureUrl,
      description: null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
      previousCredits: row.previousCredits,
    }));
  }
  if ("groups" in data) {
    return data.groups.map((row) => ({
      id: row.groupId,
      name: row.name,
      pictureUrl: null,
      description: null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
      previousCredits: row.previousCredits,
    }));
  }
  if ("models" in data) {
    return data.models.map((row) => ({
      id: row.modelId,
      name: row.name,
      pictureUrl: null,
      description: null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
      previousCredits: row.previousCredits,
    }));
  }
  if ("tools" in data) {
    return data.tools.map((row) => ({
      id: row.serverName,
      name: row.name,
      pictureUrl: null,
      description: null,
      icon: row.icon,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerInvocation,
      previousCredits: row.previousCredits,
    }));
  }
  if ("skills" in data) {
    return data.skills.map((row) => ({
      id: row.skillId,
      name: row.name,
      pictureUrl: null,
      description: row.description,
      icon: row.icon,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerInvocation,
      previousCredits: row.previousCredits,
    }));
  }
  if ("sources" in data) {
    return data.sources.map((row) => ({
      id: row.source,
      name: row.name,
      pictureUrl: null,
      description: null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
      previousCredits: row.previousCredits,
    }));
  }
  if ("apiKeys" in data) {
    return data.apiKeys.map((row) => ({
      id: row.apiKeyName,
      name: row.name,
      pictureUrl: null,
      description: null,
      icon: null,
      modelId: null,
      modelDisplayName: null,
      credits: row.credits,
      avgCredits: row.avgCreditsPerMessage,
      previousCredits: row.previousCredits,
    }));
  }
  assertNeverAndIgnore(data);
  return [];
}

export function useConsumptionTop({
  workspaceId,
  dimension,
  period,
  limit,
  offset = 0,
  search,
  filter,
  sortOrder = "desc",
  disabled,
}: {
  workspaceId: string;
  dimension: ConsumptionDimension;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  search?: string;
  filter?: ConsumptionScopeFilter;
  sortOrder?: ConsumptionTopSortOrder;
  disabled?: boolean;
}) {
  const url = `/api/w/${workspaceId}/analytics/consumption/${CONSUMPTION_TOP_ENDPOINTS[dimension]}`;
  const body: ConsumptionTopBody = {
    period: period.kind,
    days:
      period.kind === "days" ? period.days : DEFAULT_CONSUMPTION_PERIOD_DAYS,
    filter: normalizedConsumptionFilter(filter),
    limit,
    offset,
    search: search?.trim(),
    sortOrder,
  };

  const { data, error, isLoading, isValidating } = useConsumptionQuery<
    ConsumptionTopBody,
    ConsumptionTopResponse
  >({ url, body, disabled });

  const rows = useMemo(
    () => (data ? toRows(data) : emptyArray<ConsumptionTopRow>()),
    [data]
  );

  return {
    rows,
    // Everything the workspace consumed over the period, so a row's share of it
    // is `credits / totalCredits`.
    totalCredits: data?.totalCredits ?? 0,
    totalCount: data?.totalCount ?? 0,
    hasMore: data?.hasMore ?? false,
    isTopLoading: !error && isLoading,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
