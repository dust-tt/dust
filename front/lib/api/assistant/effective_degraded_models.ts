import {
  getDegradedModelIds,
  refreshDegradedModelIds,
} from "@app/lib/api/assistant/degraded_models";
import {
  getAutomaticallyDegradedModelIds,
  refreshAutomaticallyDegradedModelIds,
} from "@app/lib/api/llm/health/automatic_degradation";

/**
 * @cc [owner:frankaloia,label:product;error-handling] effective-degradation-state
 * Effective degradation MUST union cached manual overrides with cached unexpired automatic
 * degradations when automatic routing is enabled. Successful database changes MUST propagate
 * within the caches' refresh interval; refresh failure MUST retain known manual state while known
 * automatic state still expires at its persisted deadline.
 */
export function getEffectiveDegradedModelIds({
  includeAutomatic,
  nowMs = Date.now(),
}: {
  includeAutomatic: boolean;
  nowMs?: number;
}): ReadonlySet<string> {
  const effective = new Set(getDegradedModelIds());

  if (includeAutomatic) {
    for (const modelId of getAutomaticallyDegradedModelIds(nowMs)) {
      effective.add(modelId);
    }
  }

  return effective;
}

export async function refreshEffectiveDegradedModelIds({
  includeAutomatic,
  nowMs = Date.now(),
}: {
  includeAutomatic: boolean;
  nowMs?: number;
}): Promise<ReadonlySet<string>> {
  const [manual, automatic] = await Promise.all([
    refreshDegradedModelIds(),
    includeAutomatic
      ? refreshAutomaticallyDegradedModelIds(nowMs)
      : Promise.resolve(new Set<string>()),
  ]);

  return new Set([...manual, ...automatic]);
}
