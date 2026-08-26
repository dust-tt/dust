import { MICRO_CREDITS_PER_CREDIT } from "@app/lib/credits/units";
import type { ModelId } from "@app/types/shared/model_id";

export function computeGroupedModelCreditAmount({
  modelPostings,
  usageGroups,
}: {
  modelPostings: {
    consumptionItemId: ModelId;
    runUsageModelId: ModelId;
    creditAmountMicro: number;
  }[];
  usageGroups: {
    runUsageModelId: ModelId;
    providerId: string;
    modelId: string;
  }[];
}): number {
  const usageGroupByModelId = new Map(
    usageGroups.map((usage) => [
      usage.runUsageModelId,
      JSON.stringify([usage.providerId, usage.modelId]),
    ])
  );
  const amountMicroByGroup = new Map<string, number>();
  for (const posting of modelPostings) {
    const groupKey = usageGroupByModelId.get(posting.runUsageModelId);
    if (!groupKey) {
      throw new Error(
        `Missing run usage ${posting.runUsageModelId} for consumption item ${posting.consumptionItemId}`
      );
    }
    amountMicroByGroup.set(
      groupKey,
      (amountMicroByGroup.get(groupKey) ?? 0) + posting.creditAmountMicro
    );
  }

  return [...amountMicroByGroup.values()].reduce(
    (total, amountMicro) =>
      total + Math.ceil(amountMicro / MICRO_CREDITS_PER_CREDIT),
    0
  );
}
