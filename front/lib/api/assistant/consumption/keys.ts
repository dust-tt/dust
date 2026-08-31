import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import type { ModelId } from "@app/types/shared/model_id";

export const CONSUMPTION_KEY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function makeConsumptionRootKey({
  workspaceId,
  rootAgentMessageId,
}: {
  workspaceId: string;
  rootAgentMessageId: string;
}): string {
  return `consumption:root:${workspaceId}:${rootAgentMessageId}`;
}

export const CONSUMPTION_ROOT_TOTAL_FIELD = "total_micro_credits";
export const CONSUMPTION_ROOT_SUBAGENTS_FIELD = "subagents";
export const CONSUMPTION_ROOT_INITIALIZED_FIELD = "initialized";
export const CONSUMPTION_ROOT_REVISION_FIELD = "revision";

export function makeConsumptionRootExecutionField(runKey: string): string {
  return `x:${runKey}`;
}

export function makeConsumptionRootSubagentField(
  agentMessageId: ModelId
): string {
  return `a:${agentMessageId}`;
}

export function microCreditsToMicroUsd(creditAmountMicro: number): number {
  return Math.round(
    (creditAmountMicro * MODEL_COST_MICRO_USD_PER_AWU_CREDIT) / 1_000_000
  );
}
