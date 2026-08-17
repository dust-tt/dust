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
 * Models ranked by the credits they consumed over the period, averaged per
 * message: a message can go through several models (one per step, plus whatever
 * its sub-agents used), so a model's average is what it costs per message it
 * took part in.
 */

export type ConsumptionTopModelRow = {
  modelId: string;
  name: string;
  credits: number;
  previousCredits: number | null;
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopModels = {
  period: ConsumptionPeriod;
  totalCredits: number;
  hasMore: boolean;
  totalCount: number;
  // Highest credits first.
  models: ConsumptionTopModelRow[];
};

export type GetConsumptionTopModelsResponse = ConsumptionTopModels;

export async function fetchConsumptionTopModels(
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
): Promise<Result<ConsumptionTopModels, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "model",
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

  const rows = await resolveConsumptionGroupLabels(auth, "model", groups);

  return new Ok({
    period,
    totalCredits,
    hasMore,
    totalCount,
    models: rows.map((row) => ({
      modelId: row.key,
      name: row.name,
      credits: row.credits,
      previousCredits: row.previousCredits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
