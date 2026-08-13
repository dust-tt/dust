import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups as fetchConsumptionTopGroupBuckets,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Groups ranked by the credits consumed by their members over the period,
 * averaged per message. A member can belong to several groups, in which case
 * their consumption is attributed to each group they belonged to when the
 * message completed.
 */

export type ConsumptionTopGroupRow = {
  groupId: string;
  name: string;
  credits: number;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopGroups = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  groups: ConsumptionTopGroupRow[];
};

export type GetConsumptionTopGroupsResponse = ConsumptionTopGroups;

export async function fetchConsumptionTopGroups(
  auth: Authenticator,
  {
    period,
    limit,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopGroups, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroupBuckets(auth, {
    dimension: "group",
    period,
    limit,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, totalCredits } = result.value;

  const labels = await resolveDimensionLabels(
    auth,
    "group",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    groups: groups.map((group) => ({
      groupId: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
