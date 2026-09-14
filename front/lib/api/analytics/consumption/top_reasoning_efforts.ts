import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import capitalize from "lodash/capitalize";

export type ConsumptionTopReasoningEffortRow = {
  reasoningEffort: string;
  name: string;
  credits: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopReasoningEfforts = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  reasoningEfforts: ConsumptionTopReasoningEffortRow[];
};

export type GetConsumptionTopReasoningEffortsResponse =
  ConsumptionTopReasoningEfforts;

export async function fetchConsumptionTopReasoningEfforts(
  auth: Authenticator,
  {
    period,
    limit,
    offset = 0,
    search,
    filter,
    sortOrder,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
    sortOrder?: ConsumptionTopSortOrder;
  }
): Promise<Result<ConsumptionTopReasoningEfforts, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "reasoning_effort",
    period,
    limit,
    offset,
    search,
    filter,
    sortOrder,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    reasoningEfforts: groups.map((row) => ({
      reasoningEffort: row.key,
      name: capitalize(row.key),
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: avgCreditsPerUnit(row.credits, row.count),
    })),
  });
}
