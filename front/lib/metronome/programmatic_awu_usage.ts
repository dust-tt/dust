import type { Authenticator } from "@app/lib/auth";
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getMetricLlmProviderCostAwuId,
  getMetricToolInvocationsId,
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
} from "@app/lib/metronome/constants";
import { getMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import {
  isToolCategory,
  TOOL_CATEGORY_AWU_WEIGHTS,
} from "@app/lib/metronome/events";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Remaining programmatic headroom for the current billing period, in AWU
 * credits: the monthly programmatic cap minus the period's programmatic AWU
 * spend, both read live from Metronome.
 *
 * Fail-open: returns Infinity when the workspace has no Metronome customer,
 * no programmatic cap, or the cap cannot be fetched; degrades to the cap
 * alone when the spend query fails. Callers needing a hard stop on cap
 * depletion should rely on the alert-driven programmatic credit state
 * (isProgrammaticApiBlocked), not on this estimate.
 */
export async function getRemainingProgrammaticUsageFromMetronome(
  auth: Authenticator
): Promise<number> {
  const workspace = auth.getNonNullableWorkspace();
  const metronomeCustomerId = workspace.metronomeCustomerId;
  if (!metronomeCustomerId) {
    return Infinity;
  }

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (config?.programmaticMonthlyCapAwuCredits == null) {
    // No programmatic cap configured.
    return Infinity;
  }
  const programmaticCapAwuCredits = config.programmaticMonthlyCapAwuCredits;

  const metronomeContractId = auth.subscription()?.metronomeContractId ?? null;
  if (!metronomeContractId) {
    return programmaticCapAwuCredits;
  }

  const programmaticSpendRes = await fetchProgrammaticAwuSpend({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (programmaticSpendRes.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, error: programmaticSpendRes.error },
      "[Metronome] Failed to fetch the programmatic spend — using the cap as the headroom upper bound"
    );
    return programmaticCapAwuCredits;
  }

  return Math.max(
    0,
    programmaticCapAwuCredits - (programmaticSpendRes.value ?? 0)
  );
}

/**
 * Workspace-level programmatic AWU spend for the current billing period,
 * read live from the Metronome grouped usage API. Returns `null` when the
 * customer has no active billing period.
 *
 * Mirrors the query mechanics of `fetchPerUserAwuUsage` (per_user_usage.ts):
 * the usage endpoint requires midnight-aligned bounds, so query from the
 * floored period start (at HOUR granularity when the period itself does not
 * start at midnight) and drop pre-period buckets in code.
 *
 * AWU spend has two sources, both priced in the AWU credit type:
 *   - AI Usage: the `cost_awu` metric, priced 1 AWU per unit.
 *   - Tool Usage: an invocation count, weighted per category (basic ×1,
 *     advanced ×3).
 *
 * We group by `usage_type` (plus `tool_category` for tools) and keep only the
 * `programmatic` buckets in code rather than filtering the query on
 * `usage_type`: filtered queries make Metronome under-aggregate some buckets
 * (see per_user_usage.ts). Unlike the per-user query, grouping only by
 * `usage_type` has a handful of groups, so the unfiltered query is not at
 * risk of being capped server-side.
 */
export async function fetchProgrammaticAwuSpend({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Result<number | null, Error>> {
  const periodResult = await getMetronomeCurrentBillingPeriod({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (periodResult.isErr()) {
    return new Err(periodResult.error);
  }
  if (!periodResult.value) {
    return new Ok(null);
  }
  const { cycleStart, cycleEnd } = periodResult.value;
  const cycleStartMs = cycleStart.getTime();

  const startingOn = floorToMidnightUTC(cycleStart).toISOString();
  const requestEnd = new Date(Math.min(cycleEnd.getTime(), Date.now()));
  const endingBefore = ceilToMidnightUTC(requestEnd).toISOString();
  const windowSize =
    cycleStartMs === floorToMidnightUTC(cycleStart).getTime() ? "DAY" : "HOUR";

  const [aiResult, toolResult] = await Promise.all([
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize,
      groupKey: [USAGE_TYPE_GROUP_KEY],
    }),
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricToolInvocationsId(),
      startingOn,
      endingBefore,
      windowSize,
      groupKey: [USAGE_TYPE_GROUP_KEY, "tool_category"],
    }),
  ]);
  if (aiResult.isErr()) {
    return new Err(aiResult.error);
  }
  if (toolResult.isErr()) {
    return new Err(toolResult.error);
  }

  let spentAwuCredits = 0;

  // AI usage: the value is already AWU spend (cost_awu, priced 1:1).
  for (const entry of aiResult.value) {
    if (
      entry.value === null ||
      entry.group?.[USAGE_TYPE_GROUP_KEY] !== USAGE_TYPE_PROGRAMMATIC ||
      new Date(entry.startingOn).getTime() < cycleStartMs
    ) {
      continue;
    }
    spentAwuCredits += entry.value;
  }

  // Tool usage: the value is an invocation count — weight it by the
  // per-category AWU price to convert it into AWU spend.
  for (const entry of toolResult.value) {
    const category = entry.group?.["tool_category"];
    if (
      entry.value === null ||
      entry.group?.[USAGE_TYPE_GROUP_KEY] !== USAGE_TYPE_PROGRAMMATIC ||
      new Date(entry.startingOn).getTime() < cycleStartMs ||
      !category ||
      !isToolCategory(category)
    ) {
      continue;
    }
    spentAwuCredits += entry.value * TOOL_CATEGORY_AWU_WEIGHTS[category];
  }

  return new Ok(spentAwuCredits);
}
