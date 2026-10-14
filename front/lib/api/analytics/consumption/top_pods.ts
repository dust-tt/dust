import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

export type ConsumptionTopPodRow = {
  podId: string;
  name: string;
  credits: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopPods = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  pods: ConsumptionTopPodRow[];
};

export type GetConsumptionTopPodsResponse = ConsumptionTopPods;

export async function fetchConsumptionTopPods(
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
): Promise<Result<ConsumptionTopPods, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "pod",
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

  const rows = await resolveConsumptionGroupLabels(auth, "pod", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    pods: rows.map((row) => ({
      podId: row.key,
      name: row.name,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
