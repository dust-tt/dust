import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type {
  ConsumptionScopeFilter,
  ConsumptionTopSortOrder,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups as fetchConsumptionTopGroupBuckets,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Groups ranked by the credits consumed by their members over the period, with
 * distinct active-member and message counts. A member can belong to several
 * groups, in which case their consumption is attributed to each group they
 * belonged to when the message completed.
 */

export type ConsumptionTopGroupRow = {
  groupId: string;
  name: string;
  credits: number;
  activeMembers: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopGroups = {
  period: ConsumptionPeriod;
  totalCredits: number;
  totalActiveMembers: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  groups: ConsumptionTopGroupRow[];
};

export type GetConsumptionTopGroupsResponse = ConsumptionTopGroups;

export async function fetchConsumptionTopGroups(
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
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroupBuckets(auth, {
    dimension: "group",
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
  const {
    groups,
    hasMore,
    totalCount,
    totalCredits,
    totalActiveMembers = 0,
  } = result.value;

  const rows = await resolveConsumptionGroupLabels(auth, "group", groups);

  return new Ok({
    period,
    totalCredits,
    totalActiveMembers,
    hasMore,
    totalCount,
    groups: rows.map((row) => ({
      groupId: row.key,
      name: row.name,
      credits: row.credits,
      activeMembers: row.activeMembers ?? 0,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
