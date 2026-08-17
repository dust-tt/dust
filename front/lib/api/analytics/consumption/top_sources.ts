import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  fetchConsumptionTopGroups,
  resolveConsumptionGroupLabels,
} from "@app/lib/api/analytics/consumption/top";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

/**
 * Sources ranked by the credits they consumed over the period, averaged per
 * message: a source is where the conversation came in from, so every message it
 * originated belongs to it whole and the average is what a message from that
 * surface costs.
 */

export type ConsumptionTopSourceRow = {
  // The canonical context origin, which is also what the `source` filter takes.
  source: string;
  name: string;
  credits: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopSources = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  sources: ConsumptionTopSourceRow[];
};

export type GetConsumptionTopSourcesResponse = ConsumptionTopSources;

export async function fetchConsumptionTopSources(
  auth: Authenticator,
  {
    period,
    limit,
    offset = 0,
    search,
    filter,
  }: {
    period: ConsumptionPeriod;
    limit: number;
    offset?: number;
    search?: string;
    filter?: ConsumptionScopeFilter;
  }
): Promise<Result<ConsumptionTopSources, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "source",
    period,
    limit,
    offset,
    search,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, hasMore, totalCount, totalCredits } = result.value;

  const rows = await resolveConsumptionGroupLabels(auth, "source", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    sources: rows.map((row) => ({
      source: row.key,
      name: row.name,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
