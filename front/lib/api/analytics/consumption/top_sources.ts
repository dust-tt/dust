import { resolveDimensionLabels } from "@app/lib/api/analytics/consumption/labels";
import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups,
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
  // The raw context origin, which is also what the `source` filter takes.
  source: string;
  name: string;
  credits: number;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopSources = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  sources: ConsumptionTopSourceRow[];
};

export type GetConsumptionTopSourcesResponse = ConsumptionTopSources;

export async function fetchConsumptionTopSources(
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
): Promise<Result<ConsumptionTopSources, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "source",
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
    "source",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    sources: groups.map((group) => ({
      source: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
