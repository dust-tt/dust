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

/**
 * Triggers ranked by the credits they consumed over the period, averaged per
 * message: every message a trigger's runs produced belongs to it whole, so the
 * average is what one message of an automated run costs.
 */

export type ConsumptionTopTriggerRow = {
  // The trigger sId, which is also what the `triggers` filter takes.
  triggerId: string;
  name: string;
  credits: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopTriggers = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  triggers: ConsumptionTopTriggerRow[];
};

export type GetConsumptionTopTriggersResponse = ConsumptionTopTriggers;

/**
 * @cc [owner:adrsimon,label:product] row-id-is-a-triggers-filter-value
 * `triggerId` MUST be a value the `triggers` scope filter accepts, so the
 * Triggers attribution row can funnel into a filter on itself.
 */
export async function fetchConsumptionTopTriggers(
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
): Promise<Result<ConsumptionTopTriggers, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "trigger",
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

  const rows = await resolveConsumptionGroupLabels(auth, "trigger", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    triggers: rows.map((row) => ({
      triggerId: row.key,
      name: row.name,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
