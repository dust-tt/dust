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
 * Automations ranked by the credits they consumed over the period. One run is
 * one distinct conversation, even when that conversation contains several
 * messages or consumption documents.
 */

export type ConsumptionTopAutomationRow = {
  triggerId: string;
  name: string;
  agentName: string | null;
  credits: number;
  previousCredits: number | null;
  runCount: number;
  avgCreditsPerRun: number;
};

export type ConsumptionTopAutomations = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  automations: ConsumptionTopAutomationRow[];
};

export type GetConsumptionTopAutomationsResponse = ConsumptionTopAutomations;

export async function fetchConsumptionTopAutomations(
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
): Promise<Result<ConsumptionTopAutomations, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "automation",
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

  const rows = await resolveConsumptionGroupLabels(auth, "automation", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    automations: rows.map((row) => ({
      triggerId: row.key,
      name: row.name,
      agentName: row.description,
      credits: row.credits,
      previousCredits: row.previousCredits,
      runCount: row.count,
      avgCreditsPerRun: row.avgCredits,
    })),
  });
}
