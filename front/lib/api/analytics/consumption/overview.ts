import type {
  ConsumptionPeriod,
  ConsumptionPeriodInput,
} from "@app/lib/api/analytics/consumption/period";
import {
  resolveConsumptionPeriod,
  resolveCycleBoundsMs,
} from "@app/lib/api/analytics/consumption/period";
import type { ConsumptionScopeFilter } from "@app/lib/api/analytics/consumption/scope";
import {
  buildConsumptionScopeQuery,
  COMPLETED_AT_FIELD,
  CREDIT_MICRO_FIELD,
  creditsFromMicroCredits,
} from "@app/lib/api/analytics/consumption/scope";
import { getAwuPoolSummary } from "@app/lib/api/credits/awu_pool_summary";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

/**
 * Headline numbers for the consumption dashboard: how much of the credit
 * allowance the period has burned, where that lands by the end of the cycle,
 * and how many members are active.
 */

export type ConsumptionPace = "under" | "on_pace" | "over";

export type ConsumptionOverview = {
  // The resolved query window, echoed so the client renders the period header
  // without re-deriving it.
  period: ConsumptionPeriod;
  members: {
    active: number;
    total: number;
  };
  credits: {
    usedCredits: number;
    // Null when the workspace has no credit pool to compare against (no
    // Metronome contract, or the pool could not be read).
    capCredits: number | null;
    usedRatio: number | null;
  };
  // Null when the period has no fixed end to project onto (a "last N days"
  // window), or too little of the cycle has elapsed for a projection to mean
  // anything.
  projection: {
    projectedCredits: number;
    projectedRatio: number | null;
    pace: ConsumptionPace | null;
  } | null;
  // Timestamp of the latest record taken into account for the overview.
  lastRecordAt: string | null;
};

export type GetConsumptionOverviewResponse = ConsumptionOverview;

// Below this much of the cycle elapsed, extrapolating the run rate produces
// numbers that swing wildly from one message to the next, so we report no
// projection rather than a misleading one.
const MIN_ELAPSED_RATIO_FOR_PROJECTION = 0.05;

// A projection landing within this fraction of the cap counts as on pace;
// anything over the cap is over.
const ON_PACE_LOWER_BOUND = 0.9;

type OverviewAggs = {
  used_credit_micro?: estypes.AggregationsSumAggregate;
  active_members?: estypes.AggregationsCardinalityAggregate;
  last_completed_at?: estypes.AggregationsMaxAggregate;
};

// Fraction of the current billing cycle already elapsed, in [0, 1] — the basis
// for the end-of-cycle projection. Only a cycle has a fixed end to measure
// against; a "last N days" window returns null (no projection). Computed here
// rather than on the shared period so the period stays a plain query window.
async function resolveElapsedCycleRatio(
  auth: Authenticator,
  periodInput: ConsumptionPeriodInput
): Promise<number | null> {
  if (periodInput.kind !== "cycle") {
    return null;
  }
  const nowMs = Date.now();
  const { cycleStartMs, cycleEndMs } = await resolveCycleBoundsMs(auth, nowMs);
  // Guard a zero-length cycle (a contract starting exactly now) so the ratio
  // stays finite.
  const totalMs = Math.max(1, cycleEndMs - cycleStartMs);
  const elapsedMs = Math.max(0, Math.min(nowMs, cycleEndMs) - cycleStartMs);
  return Math.min(1, elapsedMs / totalMs);
}

function paceFromProjectedRatio(projectedRatio: number): ConsumptionPace {
  if (projectedRatio > 1) {
    return "over";
  }
  return projectedRatio >= ON_PACE_LOWER_BOUND ? "on_pace" : "under";
}

function buildProjection(
  usedCredits: number,
  capCredits: number | null,
  elapsedRatio: number | null
): ConsumptionOverview["projection"] {
  if (
    elapsedRatio === null ||
    elapsedRatio < MIN_ELAPSED_RATIO_FOR_PROJECTION
  ) {
    return null;
  }

  const projectedCredits = usedCredits / elapsedRatio;
  if (capCredits === null || capCredits <= 0) {
    return { projectedCredits, projectedRatio: null, pace: null };
  }

  const projectedRatio = projectedCredits / capCredits;
  return {
    projectedCredits,
    projectedRatio,
    pace: paceFromProjectedRatio(projectedRatio),
  };
}

// The pool summary is a Metronome round-trip.
// If it fails, we log a warning but don't fail the overview request, since the
// rest of the overview can still be computed. The capCredits field will be null
// in that case.
async function fetchCapCredits(auth: Authenticator): Promise<number | null> {
  const summaryResult = await getAwuPoolSummary(auth);
  if (summaryResult.isErr()) {
    if (summaryResult.error.type !== "not_configured") {
      logger.warn(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          err: summaryResult.error,
        },
        "[ConsumptionAnalytics] Failed to read the AWU pool summary."
      );
    }
    return null;
  }
  return summaryResult.value.totalActiveCredits;
}

function lastRecordAtFromAgg(
  agg: estypes.AggregationsMaxAggregate | undefined
): string | null {
  if (!agg || agg.value === null || agg.value === undefined) {
    return null;
  }
  return agg.value_as_string ?? new Date(agg.value).toISOString();
}

export async function fetchConsumptionOverview(
  auth: Authenticator,
  {
    periodInput,
    filter,
  }: { periodInput: ConsumptionPeriodInput; filter?: ConsumptionScopeFilter }
): Promise<Result<ConsumptionOverview, ElasticsearchError>> {
  const workspace = auth.getNonNullableWorkspace();
  const period = await resolveConsumptionPeriod(auth, periodInput);

  const query = buildConsumptionScopeQuery({
    workspaceId: workspace.sId,
    startDate: period.startDate,
    endDate: period.endDate,
    filter,
  });

  const [searchResult, totalMembers, capCredits, elapsedRatio] =
    await Promise.all([
      searchConsumptionAnalytics<never, OverviewAggs>(query, {
        aggregations: {
          used_credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
          active_members: { cardinality: { field: "user.id" } },
          last_completed_at: { max: { field: COMPLETED_AT_FIELD } },
        },
        size: 0,
      }),
      MembershipResource.countActiveMembersForWorkspace({ workspace }),
      fetchCapCredits(auth),
      resolveElapsedCycleRatio(auth, periodInput),
    ]);

  if (searchResult.isErr()) {
    return searchResult;
  }

  const aggregations = searchResult.value.aggregations;
  const usedCredits = creditsFromMicroCredits(
    aggregations?.used_credit_micro?.value ?? 0
  );

  return new Ok({
    period,
    members: {
      active: Math.round(aggregations?.active_members?.value ?? 0),
      total: totalMembers,
    },
    credits: {
      usedCredits,
      capCredits,
      usedRatio:
        capCredits !== null && capCredits > 0 ? usedCredits / capCredits : null,
    },
    projection: buildProjection(usedCredits, capCredits, elapsedRatio),
    lastRecordAt: lastRecordAtFromAgg(aggregations?.last_completed_at),
  });
}
