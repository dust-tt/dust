import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import { CONSUMPTION_DIMENSION_UNIT } from "@app/lib/api/analytics/consumption/scope";
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
  messageCount: number;
  avgCreditsPerMessage: number;
};

export type ConsumptionTopModels = {
  period: ConsumptionPeriod;
  totalCredits: number;
  // Highest credits first.
  models: ConsumptionTopModelRow[];
};

export type GetConsumptionTopModelsResponse = ConsumptionTopModels;

export async function fetchConsumptionTopModels(
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
): Promise<Result<ConsumptionTopModels, ElasticsearchError>> {
  const result = await fetchConsumptionTopGroups(auth, {
    dimension: "model",
    unit: CONSUMPTION_DIMENSION_UNIT.model,
    period,
    limit,
    filter,
  });
  if (result.isErr()) {
    return result;
  }
  const { groups, totalCredits } = result.value;

  const rows = await resolveConsumptionGroupLabels(auth, "model", groups);

  return new Ok({
    period,
    totalCredits,
    models: rows.map((row) => ({
      modelId: row.key,
      name: row.name,
      credits: row.credits,
      messageCount: row.count,
      avgCreditsPerMessage: row.avgCredits,
    })),
  });
}
