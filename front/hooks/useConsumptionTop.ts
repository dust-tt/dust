import type { ConsumptionDimension } from "@app/components/workspace/analytics/consumption/consumptionDimensions";
import {
  getConsumptionAnalyticsUrl,
  useConsumptionQuery,
} from "@app/hooks/useConsumptionQuery";
import type { ConsumptionPeriodSelection } from "@app/lib/analytics/consumption_period";
import {
  DEFAULT_CONSUMPTION_PERIOD_DAYS,
  normalizedConsumptionFilter,
} from "@app/lib/analytics/consumption_period";
import type { ConsumptionAnalyticsScope } from "@app/lib/analytics/consumption_scope";
import type { ConsumptionTopBody } from "@app/lib/api/analytics/consumption/schema";
import type { GetConsumptionTopAgentsResponse } from "@app/lib/api/analytics/consumption/top_agents";
import type { GetConsumptionTopApiKeysResponse } from "@app/lib/api/analytics/consumption/top_api_keys";
import type { GetConsumptionTopGroupsResponse } from "@app/lib/api/analytics/consumption/top_groups";
import type { GetConsumptionTopModelsResponse } from "@app/lib/api/analytics/consumption/top_models";
import type { GetConsumptionTopReasoningEffortsResponse } from "@app/lib/api/analytics/consumption/top_reasoning_efforts";
import type { GetConsumptionTopSkillsResponse } from "@app/lib/api/analytics/consumption/top_skills";
import type { GetConsumptionTopSourcesResponse } from "@app/lib/api/analytics/consumption/top_sources";
import type { GetConsumptionTopToolsResponse } from "@app/lib/api/analytics/consumption/top_tools";
import type { GetConsumptionTopUsersResponse } from "@app/lib/api/analytics/consumption/top_users";
import { emptyArray } from "@app/lib/swr/swr";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/types/api/analytics/consumption";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useMemo } from "react";

export type ConsumptionTopDimension = ConsumptionDimension | "reasoning_effort";

const CONSUMPTION_TOP_ENDPOINTS = {
  agent: "top-agents",
  user: "top-users",
  group: "top-groups",
  model: "top-models",
  reasoning_effort: "top-reasoning-efforts",
  tool: "top-tools",
  skill: "top-skills",
  source: "top-sources",
  api_key: "top-api-keys",
} as const satisfies Record<ConsumptionTopDimension, string>;

export type ConsumptionTopRow = {
  id: string;
  name: string;
  detailsHref?: string;
  pictureUrl: string | null;
  description: string | null;
  icon: string | null;
  modelId: string | null;
  modelDisplayName: string | null;
  credits: number;
  avgCredits: number;
  activeMembers?: number;
  totalMembers?: number;
  previousCredits: number | null;
};

export type ConsumptionTopResponse =
  | GetConsumptionTopAgentsResponse
  | GetConsumptionTopUsersResponse
  | GetConsumptionTopGroupsResponse
  | GetConsumptionTopModelsResponse
  | GetConsumptionTopReasoningEffortsResponse
  | GetConsumptionTopToolsResponse
  | GetConsumptionTopSkillsResponse
  | GetConsumptionTopSourcesResponse
  | GetConsumptionTopApiKeysResponse;

export interface UseConsumptionTopParams {
  workspaceId: string;
  dimension: ConsumptionTopDimension;
  period: ConsumptionPeriodSelection;
  limit: number;
  offset?: number;
  search?: string;
  filter?: ConsumptionScopeFilter;
  analyticsScope?: ConsumptionAnalyticsScope;
  sortOrder?: ConsumptionTopSortOrder;
  disabled?: boolean;
}

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
      activeMembers: row.activeMembers,
      totalMembers: Math.max(row.totalMembers, row.activeMembers),
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
  if ("reasoningEfforts" in data) {
    return data.reasoningEfforts.map((row) => ({
      id: row.reasoningEffort,
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
  analyticsScope,
  sortOrder = "desc",
  disabled,
}: UseConsumptionTopParams) {
  const url = getConsumptionAnalyticsUrl({
    workspaceId,
    analyticsScope,
    endpoint: CONSUMPTION_TOP_ENDPOINTS[dimension],
  });
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
    () => (data ? toConsumptionTopRows(data) : emptyArray<ConsumptionTopRow>()),
    [data]
  );

  return {
    rows,
    // Selected-scope totals back row-relative metrics. Group rows also use the
    // distinct active-member total to compare per-member usage.
    totalCredits: data?.totalCredits ?? 0,
    totalActiveMembers:
      data && "totalActiveMembers" in data ? data.totalActiveMembers : 0,
    totalCount: data?.totalCount ?? 0,
    hasMore: data?.hasMore ?? false,
    isTopLoading: !error && isLoading,
    isTopError: error,
    isTopValidating: isValidating,
  };
}
