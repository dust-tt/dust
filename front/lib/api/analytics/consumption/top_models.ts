import type { ConsumptionPeriod } from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  avgCreditsPerUnit,
  fetchConsumptionTopGroups,
} from "@app/lib/api/analytics/consumption/top";
import type { ModelsTierName } from "@app/lib/api/assistant/token_pricing/tiers";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { resolveDimensionLabels } from "./labels";

/**
 * Models ranked by the credits they consumed over the period, averaged per
 * message: a message can go through several models (one per step, plus whatever
 * its sub-agents used), so a model's average is what it costs per message it
 * took part in.
 */

export type ConsumptionTopModelRow = {
  modelId: string;
  name: string;
  modelMaker: ModelMakerIdType | null;
  tier: ModelsTierName | null;
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
    unit: "message",
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
    "model",
    groups.map((group) => group.key)
  );

  return new Ok({
    period,
    totalCredits,
    models: groups.map((group) => ({
      modelId: group.key,
      name: labels.get(group.key)?.name ?? group.key,
      modelMaker: labels.get(group.key)?.modelMaker ?? null,
      tier: labels.get(group.key)?.tier ?? null,
      credits: group.credits,
      messageCount: group.count,
      avgCreditsPerMessage: avgCreditsPerUnit(group.credits, group.count),
    })),
  });
}
