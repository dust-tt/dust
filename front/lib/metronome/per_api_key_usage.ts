import { listMetronomeUsageWithGroups } from "@app/lib/metronome/client";
import {
  getMetricLlmProviderCostAwuId,
  getMetricToolInvocationsId,
} from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { buildUsageQuerySegments } from "@app/lib/metronome/per_user_usage";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export const API_KEY_NAME_GROUP_KEY = "api_key_name";

function flattenUsageResults<T>(
  results: Array<Result<T[], Error>>
): Result<T[], Error> {
  const merged: T[] = [];
  for (const result of results) {
    if (result.isErr()) {
      return result;
    }
    merged.push(...result.value);
  }
  return new Ok(merged);
}

function fetchSegmentedUsage({
  segments,
  metronomeCustomerId,
  billableMetricId,
  groupKey,
  keyNames,
}: {
  segments: ReturnType<typeof buildUsageQuerySegments>;
  metronomeCustomerId: string;
  billableMetricId: string;
  groupKey: string[];
  keyNames: string[];
}) {
  return concurrentExecutor(
    segments,
    (segment) =>
      listMetronomeUsageWithGroups({
        customerId: metronomeCustomerId,
        billableMetricId,
        startingOn: segment.startingOn,
        endingBefore: segment.endingBefore,
        windowSize: segment.windowSize,
        groupKey,
        groupFilters: { [API_KEY_NAME_GROUP_KEY]: keyNames },
      }),
    { concurrency: 3 }
  ).then(flattenUsageResults);
}

/**
 * Per-API-key AWU consumption for the current billing period, keyed by key
 * name. Mirrors `fetchPerUserAwuUsage` but scopes to `api_key_name` instead of
 * `user_id` (both are billable-metric group keys on the AWU products).
 *
 * Scoped to `keyNames` via an `api_key_name` `group_filters`: an unfiltered
 * query is capped server-side and silently omits groups. The AWU products only
 * expose `[api_key_name]` and `[api_key_name, tool_category]` as compound group
 * keys (no `usage_type` dimension), so — unlike the per-user query — free usage
 * can't be split out here. We count total per-name spend, which matches what
 * the per-name Metronome cap alert measures. AI Usage is already AWU spend
 * (cost_awu, priced 1:1); Tool Usage is an invocation count weighted by the
 * per-category AWU price.
 */
export async function fetchPerApiKeyAwuUsage({
  workspaceId,
  metronomeCustomerId,
  keyNames,
}: {
  workspaceId: string;
  metronomeCustomerId: string;
  keyNames: string[];
}): Promise<Result<Map<string, number>, Error>> {
  if (keyNames.length === 0) {
    return new Ok(new Map());
  }
  const periodResult =
    await getCachedMetronomeCurrentBillingPeriod(workspaceId);
  if (periodResult.isErr()) {
    return new Err(periodResult.error);
  }
  if (!periodResult.value) {
    return new Ok(new Map());
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  const cycleEndMs = cycleEnd.getTime();
  const cycleStartMs = cycleStart.getTime();

  const requestEnd = new Date(Math.min(cycleEndMs, Date.now()));
  const segments = buildUsageQuerySegments({ cycleStart, requestEnd });
  if (segments.length === 0) {
    return new Ok(new Map());
  }

  const [aiResult, toolResult] = await Promise.all([
    fetchSegmentedUsage({
      segments,
      metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      groupKey: [API_KEY_NAME_GROUP_KEY],
      keyNames,
    }),
    fetchSegmentedUsage({
      segments,
      metronomeCustomerId,
      billableMetricId: getMetricToolInvocationsId(),
      groupKey: [API_KEY_NAME_GROUP_KEY, "tool_category"],
      keyNames,
    }),
  ]);
  if (aiResult.isErr()) {
    return new Err(aiResult.error);
  }
  if (toolResult.isErr()) {
    return new Err(toolResult.error);
  }

  const perKey = new Map<string, number>();

  // AI usage: the value is already AWU spend (cost_awu, priced 1:1).
  for (const entry of aiResult.value) {
    const keyName = entry.group?.[API_KEY_NAME_GROUP_KEY];
    if (
      !keyName ||
      entry.value === null ||
      new Date(entry.startingOn).getTime() < cycleStartMs ||
      new Date(entry.startingOn).getTime() >= cycleEndMs
    ) {
      continue;
    }
    perKey.set(keyName, (perKey.get(keyName) ?? 0) + entry.value);
  }

  // Tool usage: the value is an invocation count — weight it by the
  // per-category AWU price to convert it into AWU spend.
  for (const entry of toolResult.value) {
    const keyName = entry.group?.[API_KEY_NAME_GROUP_KEY];
    const category = entry.group?.["tool_category"];
    if (
      !keyName ||
      entry.value === null ||
      new Date(entry.startingOn).getTime() < cycleStartMs ||
      new Date(entry.startingOn).getTime() >= cycleEndMs ||
      !category ||
      !isToolCategory(category)
    ) {
      continue;
    }
    const awuSpent = entry.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
    perKey.set(keyName, (perKey.get(keyName) ?? 0) + awuSpent);
  }

  return new Ok(perKey);
}
