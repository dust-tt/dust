import type { PremiumModelMessageUsage } from "@app/lib/api/assistant/rate_limits";
import {
  getPremiumModelMessageUsage,
  getPremiumModelMessageUsedCountsByUser,
  makeApiKeySpendLimitAwuCreditsRateLimitKey,
  makeProgrammaticSpendLimitAwuCreditsRateLimitKeyForWorkspace,
  makeSpendLimitAwuCreditsRateLimitKeyForUser,
  makeSpendLimitCycleWindowBounds,
} from "@app/lib/api/assistant/rate_limits";
import { computeCreditUsageStatus } from "@app/lib/api/credits/usage_status";
import {
  bucketsToArray,
  searchAnalytics,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { BillingCycle } from "@app/lib/client/subscription";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { listPerUserCreditBalanceAlertsForWorkspace } from "@app/lib/metronome/alerts/per_user_credit_balance";
import type {
  MetronomeCapAlertIds,
  MetronomeCapAlertInfo,
} from "@app/lib/metronome/alerts/spend_limits";
import {
  getCachedDefaultCapThresholdsBySeatType,
  getCachedPerUserCapAlertIds,
  USER_AWU_WARNING_PERCENTAGE,
} from "@app/lib/metronome/alerts/spend_limits";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import { getCachedCustomerPerUserCreditBalances } from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  getCreditTypeAwuId,
  toFreeMetronomeUserId,
  USAGE_TYPE_PROGRAMMATIC,
} from "@app/lib/metronome/constants";
import { getCachedMetronomeCurrentBillingPeriod } from "@app/lib/metronome/contracts";
import { getPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import type { SeatData } from "@app/lib/metronome/seats";
import {
  getCachedSeatBalances,
  getCachedSeatDataByUserId,
} from "@app/lib/metronome/seats";
import type { BillingFrequency } from "@app/lib/metronome/types";
import {
  getFairUseAwuCreditsStatus,
  getFairUseAwuCreditsUsedCountsByUser,
  isUserAwuWarnedByMetronome,
} from "@app/lib/metronome/user_block";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { spendLimitCycleOverrideForAuth } from "@app/lib/spend_limits/cycle";
import type { EffectiveSpendLimitSource } from "@app/lib/spend_limits/effective";
import {
  resolveEffectiveSpendLimitAwuCredits,
  resolveEffectiveSpendLimitSource,
} from "@app/lib/spend_limits/effective";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  getFixedWindowCount,
  getTimeframeSecondsFromLiteral,
  setFixedWindowCount,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type {
  CreditUsageStatus,
  CreditUsageTarget,
} from "@app/types/api/credits/usage_status";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type {
  MembershipSeatType,
  NormalizedPoolLimitSeatType,
  UserCreditState,
} from "@app/types/memberships";
import {
  hasMetronomeSeatBalance,
  MEMBERSHIP_SEAT_TYPES,
  NORMALIZED_POOL_LIMIT_SEAT_TYPES,
  normalizeToPoolLimitSeatType,
  toBaseSeatType,
  USER_CREDIT_STATES,
} from "@app/types/memberships";
import type { MaxAwuCreditsTimeframeType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import { z } from "zod";

export type MemberUsageType = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  groups: string[];
  seatType: MembershipSeatType | null;
  // Per-user AWU allocation granted by the seat (in credits). Null when the
  // user has no seat or the seat carries no allocation.
  memberUsageLimit: number | null;
  // Live Metronome per-seat AWU balance remaining (the amount Metronome has
  // not yet drained from the seat grant). Null when the user has no individual
  // seat allocation (pool-based seat) or seat balances couldn't be read. This
  // is the same signal the seat-balance alerts fire on, so it can differ from
  // `memberUsageLimit - consumedFromAllowanceAwuCredits` when usage isn't fully
  // drawn from the seat grant.
  seatBalanceAwu: number | null;
  // Total user AWU consumption for the period, regardless of whether it
  // was covered by the seat allocation or overflowed into the workspace
  // pool.
  consumedAwuCredits: number;
  // Breakdown of `consumedAwuCredits`: the portion covered by the user's seat
  // allowance (credits drain seat-first) vs. the portion that overflowed into
  // the workspace pool (plus any PAYG overage). Always sums to
  // `consumedAwuCredits`. Derived from total usage capped at the seat
  // allocation: Metronome materializes seat (INDIVIDUAL) credits as a single
  // per-subscription pool with no per-user balance, so an exact ledger split
  // isn't available — but per-user usage is exact, so this is exact except
  // when a mid-period-prorated user exceeds their (prorated) allocation.
  consumedFromAllowanceAwuCredits: number;
  consumedFromPoolAwuCredits: number;
  // Billing cadence for the seat subscription the user is assigned to; null when unknown.
  billingFrequency: BillingFrequency | null;
  // ISO timestamp of when the seat credit resets (= next billing period start).
  // Null for free seats (lifetime grant) or when no billing period is available.
  nextCreditResetAt: string | null;
  // Set when a future seat change is scheduled (e.g. at the next credit refresh).
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  // Per-user total spend cap in AWU credits for the billing period
  spendLimitAwuCredits: number | null;
  // AWU credits recorded in the Redis fixed-window spend-cap counter for the
  // current billing cycle — the value enforcement reads, shown alongside the
  // Elasticsearch-derived `consumedAwuCredits` to compare the two. Poke-only
  // (null otherwise, or when the billing period can't be resolved).
  rateLimiterSpendAwuCredits: number | null;
  // Metronome-side per-user AWU consumption for the current billing cycle (the
  // value reconcile and the per-user cap check read). Shown next to the ES and
  // rate-limiter figures to spot divergence. Poke-only (null otherwise, or when
  // Metronome isn't configured).
  metronomeConsumedAwuCredits: number | null;
  // Where `spendLimitAwuCredits` comes from: a user-specific `override`, the
  // seat-type `default`, or `none` (no cap configured / unlimited).
  spendLimitSource: EffectiveSpendLimitSource;
  // Name of the group behind `spendLimitAwuCredits` when `spendLimitSource`
  // is `"group"`. Null for every other source.
  spendLimitGroupName: string | null;
  // Id of the Metronome alert backing the effective cap (override or default),
  // for deep-linking to the dashboard. Null when uncapped.
  spendLimitAlertId: string | null;
  // Id of the companion 80% warning alert for the effective cap. Null when
  // uncapped or no warning alert exists.
  spendLimitWarningAlertId: string | null;
  // Per-user free-credit balance alerts (low at 20%, empty at 0), each with its
  // current Metronome status for the `AlertChip` badges. Free seats only, and
  // only populated when alert links are requested (poke). Null otherwise.
  freeCreditLowAlert: MetronomeAlertRef | null;
  freeCreditEmptyAlert: MetronomeAlertRef | null;
  // Per-user credit state machine state (personal-credits → pool → capped
  // progression) persisted on the membership. Surfaced for debugging.
  creditState: UserCreditState;
  // Whether the user has consumed ≥ 80% of their effective limit. With the
  // rate-cap flag on, derived from the Redis rate-limiter counter; with it off,
  // from the Metronome nearLimit flag (see user_block.ts). Poke-only.
  nearLimit: boolean;
  // Classifies seat-allowance consumption against how far the billing cycle
  // has elapsed: "elevated"/"critical" mean the member is burning through
  // their seat allowance faster than a linear pace would predict. Poke-only
  // (null otherwise, or when the billing cycle can't be resolved).
  seatUsageTarget: CreditUsageTarget | null;
  // Same pace classification as `seatUsageTarget`, but against the member's
  // total effective spend limit (seat allowance + pool/overage).
  overallUsageTarget: CreditUsageTarget | null;
  // Per-user fair-use AWU credit usage (credits, with decimals) backed by the
  // microCredit rate-limit counter. Applies to non-credit-based plans
  // (free/trial) where a fair-use limit is set. Null when the plan carries no
  // fair-use limit (limit === -1) or when not requested. Poke-only.
  fairUse?: MemberFairUseUsage | null;
  premiumMessageUsage?: PremiumModelMessageUsage | null;
};

export type MemberFairUseUsage = {
  usedCredits: number;
  limitCredits: number;
  timeframe: MaxAwuCreditsTimeframeType;
  windowDays: number;
  nextResetAt: string | null;
  refillSchedule: { date: string; credits: number }[];
};

export type GetMembersUsageResponseBody = {
  members: MemberUsageType[];
  total: number;
  // ISO end of the current billing period: when per-seat credits next reset.
  // Optional for backward compatibility.
  // null when Metronome is not configured or the period cannot be resolved.
  creditsResetAt: string | null;
};

// Workspace seats have a zero AWU allocation, so `buildSeatDataByUserId` skips
// them and we never get a Metronome-derived billing frequency. The cadence is
// still encoded in the seat type itself, so derive it from there as a fallback
// to display the period like for other seats.
function deriveWorkspaceSeatBillingFrequency(
  seatType: MembershipSeatType | null
): BillingFrequency | null {
  switch (seatType) {
    case "workspace":
      return "MONTHLY";
    case "workspace_yearly":
      return "ANNUAL";
    default:
      return null;
  }
}

const DEFAULT_MEMBERS_USAGE_PAGE_LIMIT = 50;
const MAX_MEMBERS_USAGE_PAGE_LIMIT = 150;

export const MembersUsagePaginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_MEMBERS_USAGE_PAGE_LIMIT)
    .catch(DEFAULT_MEMBERS_USAGE_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).catch(0),
  search: z.string().optional().catch(undefined),
  // Members are ordered by name (ascending) by default, giving a stable order
  // for pagination instead of relevance ranking. "name"/"email" are sorted by
  // the search index; every other column is sorted in-app over the full
  // matching set (see resolveMembersUsagePageUsers).
  orderColumn: z
    .enum([
      "name",
      "email",
      // Legacy usage page only: sorts by total consumed credits. Kept
      // alongside `consumedFromPoolAwuCredits`, which sorts by pool-only
      // consumption for the compact (Poke) variant.
      // TODO(avervaet, 2026-09-01): remove once the app page and Poke page usage tables are uniformized.
      "consumedAwuCredits",
      "consumedFromPoolAwuCredits",
      "seatType",
      "creditState",
      "seatUsage",
      "premiumMessageUsage",
      "fairUse",
    ])
    .catch("name"),
  orderDirection: z.enum(["asc", "desc"]).catch("asc"),
  // Optional seat-type filter. A base seat type (e.g. "pro") matches its
  // monthly and yearly variants; "none" matches members with no seat.
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES).optional().catch(undefined),
  // Optional credit-state filter (the per-user credit state machine state).
  creditState: z.enum(USER_CREDIT_STATES).optional().catch(undefined),
  // Optional group filter (group sId). Restricts the table to the active
  // members of that group. Combined with `seatType`/`creditState` as an
  // intersection.
  groupId: z.string().optional().catch(undefined),
});

type MembersUsagePaginationInput = z.infer<typeof MembersUsagePaginationSchema>;

type ConsumedCreditsSplit = {
  credits?: estypes.AggregationsSumAggregate;
};

type ConsumedCreditsBucket = {
  key: string;
  paid_credits?: ConsumedCreditsSplit;
  free_credits?: ConsumedCreditsSplit;
};

type ConsumedCreditsAggs = {
  by_user?: estypes.AggregationsMultiBucketAggregateBase<ConsumedCreditsBucket>;
};

// End of the workspace's current billing period — the instant per-seat credits
// next reset. Reads the same cached period `fetchConsumedAwuCreditsByUserId`
// scopes the consumed totals to, so the two always agree. Null when Metronome
// is not set up for the workspace or the period cannot be resolved.
async function fetchCreditsResetAt(
  workspace: LightWorkspaceType
): Promise<string | null> {
  const periodResult = await getCachedMetronomeCurrentBillingPeriod(
    workspace.sId
  );
  if (periodResult.isErr()) {
    logger.warn(
      { err: periodResult.error, workspaceId: workspace.sId },
      "[MembersUsage] Failed to resolve billing period for credits reset date"
    );
    return null;
  }
  return periodResult.value?.cycleEnd.toISOString() ?? null;
}

// The workspace's current Metronome contract billing period, or null when it
// cannot be resolved (no contract, or a Metronome failure).
export async function resolveMetronomeCycle(
  workspace: LightWorkspaceType
): Promise<BillingCycle | null> {
  const periodResult = await getCachedMetronomeCurrentBillingPeriod(
    workspace.sId
  );
  if (periodResult.isErr()) {
    logger.warn(
      { err: periodResult.error, workspaceId: workspace.sId },
      "[MembersUsage] Failed to resolve billing period"
    );
    return null;
  }
  return periodResult.value;
}

// Per-user consumed AWU credits for the current billing cycle, summed from the
// analytics index (`cost.billable_awu`, precomputed at index time) by Elasticsearch.
// This replaces the per-user Metronome usage scan that previously dominated the
// members-table load.
//
// Consumption is split on the `is_free_seat` dimension (the seat the author held
// when each message was indexed), mirroring Metronome's free-seat user-id split
// (`free-<sId>` vs `<sId>`): free-seat users see their free-seat usage, paid (and
// seatless) users see only their paid-seat usage. A free→paid upgrade therefore
// drops the user's pre-upgrade free usage (its docs stay `is_free_seat: true`),
// while paid→paid changes (pro→max) keep counting (all `is_free_seat: false`).
//
// Sums `cost.billable_awu` (= the message's `costCredits`), which already encodes
// the billing policy per execution: every non-error execution counts, the errored
// terminal execution does not — so failed-terminal messages contribute their
// non-error work (0 when the only/last execution errored). This matches Metronome
// without a status filter. Returns an empty map on any failure so the table still
// renders (the consumed column shows 0).
//
// `cycle` forces the window instead of resolving the Metronome contract billing
// period — used by workspaces that have no contract to anchor one on (see
// `spendLimitCycleOverrideForAuth`).
async function fetchConsumedAwuCreditsByUserId({
  workspace,
  userIds,
  freeSeatUserIds,
  cycle,
}: {
  workspace: LightWorkspaceType;
  userIds: string[];
  freeSeatUserIds: string[];
  cycle?: BillingCycle;
}): Promise<Map<string, number>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const resolvedCycle = cycle ?? (await resolveMetronomeCycle(workspace));
  if (!resolvedCycle) {
    return new Map();
  }
  const { cycleStart, cycleEnd } = resolvedCycle;

  const freeSeatUserIdSet = new Set(freeSeatUserIds);

  const result = await searchAnalytics<never, ConsumedCreditsAggs>(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { user_id: userIds } },
          // No status filter: `cost.billable_awu` is already 0 for the non-billable
          // (errored terminal execution) part, so failed-terminal messages
          // contribute only their non-error work — matching Metronome per execution.
          {
            range: {
              timestamp: {
                gte: cycleStart.toISOString(),
                lte: cycleEnd.toISOString(),
              },
            },
          },
        ],
      },
    },
    {
      aggregations: {
        // One bucket per user, each splitting consumption on the `is_free_seat`
        // dimension so we can pick the side matching the user's current seat:
        //   - `paid_credits`: paid-seat usage. `must_not is_free_seat=true`
        //     (rather than `is_free_seat=false`) so historical docs indexed
        //     before this field existed — which can't be backfilled — count as
        //     paid.
        //   - `free_credits`: free-seat usage (from before an upgrade).
        by_user: {
          terms: {
            field: "user_id",
            size: Math.max(1, userIds.length),
          },
          aggs: {
            paid_credits: {
              filter: {
                bool: { must_not: [{ term: { is_free_seat: true } }] },
              },
              aggs: { credits: { sum: { field: "cost.billable_awu" } } },
            },
            free_credits: {
              filter: { term: { is_free_seat: true } },
              aggs: { credits: { sum: { field: "cost.billable_awu" } } },
            },
          },
        },
      },
      size: 0,
    }
  );
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "[MembersUsage] Failed to read consumed credits from analytics index"
    );
    return new Map();
  }

  const consumedByUserId = new Map<string, number>();
  for (const bucket of bucketsToArray<ConsumedCreditsBucket>(
    result.value.aggregations?.by_user?.buckets
  )) {
    const userId = String(bucket.key);
    // Free-seat users count their free-seat usage; paid (and seatless) users
    // count only their paid-seat usage.
    const split = freeSeatUserIdSet.has(userId)
      ? bucket.free_credits
      : bucket.paid_credits;
    consumedByUserId.set(userId, Math.round(split?.credits?.value ?? 0));
  }
  return consumedByUserId;
}

/**
 * A single user's Elasticsearch-derived AWU consumption for the current billing
 * cycle — the same figure the members table shows as "Consumed (ES)", scoped to
 * one user (with the free/paid seat split applied). Used to lazily seed the
 * per-user spend-cap counter on a Redis miss. Returns 0 when there is no usage
 * or the analytics read fails.
 */
export async function getEsConsumedAwuCreditsForUser(
  auth: Authenticator,
  { user, cycle }: { user: UserResource; cycle?: BillingCycle }
): Promise<number> {
  const workspace = auth.getNonNullableWorkspace();
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  const freeSeatUserIds = membership?.seatType === "free" ? [user.sId] : [];
  const consumedByUserId = await fetchConsumedAwuCreditsByUserId({
    workspace,
    userIds: [user.sId],
    freeSeatUserIds,
    cycle,
  });
  return consumedByUserId.get(user.sId) ?? 0;
}

type ApiKeyConsumedCreditsBucket = {
  key: string;
  credits?: estypes.AggregationsSumAggregate;
};

type ApiKeyConsumedCreditsAggs = {
  by_api_key_name?: estypes.AggregationsMultiBucketAggregateBase<ApiKeyConsumedCreditsBucket>;
};

/**
 * Elasticsearch-derived AWU consumption for the current billing cycle, summed
 * per `api_key_name` — the same dimension the Metronome per-API-key cap alert
 * aggregates spend on. Used to lazily seed / resync the per-API-key spend-cap
 * counter, and to populate the poke API-keys usage table. Returns an empty map
 * on no usage or an analytics read failure.
 */
export async function fetchConsumedAwuCreditsByApiKeyName({
  workspace,
  apiKeyNames,
  cycle,
}: {
  workspace: LightWorkspaceType;
  apiKeyNames: string[];
  cycle?: BillingCycle;
}): Promise<Map<string, number>> {
  if (apiKeyNames.length === 0) {
    return new Map();
  }

  const resolvedCycle = cycle ?? (await resolveMetronomeCycle(workspace));
  if (!resolvedCycle) {
    return new Map();
  }
  const { cycleStart, cycleEnd } = resolvedCycle;

  const result = await searchConsumptionAnalytics<
    never,
    ApiKeyConsumedCreditsAggs
  >(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { api_key_name: apiKeyNames } },
          {
            range: {
              completed_at: {
                gte: cycleStart.toISOString(),
                lte: cycleEnd.toISOString(),
              },
            },
          },
        ],
      },
    },
    {
      aggregations: {
        by_api_key_name: {
          terms: {
            field: "api_key_name",
            size: Math.max(1, apiKeyNames.length),
          },
          aggs: { credits: { sum: { field: "credit_micro" } } },
        },
      },
      size: 0,
    }
  );
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "[MembersUsage] Failed to read per-API-key consumed credits from analytics index"
    );
    return new Map();
  }

  const consumedByApiKeyName = new Map<string, number>();
  for (const bucket of bucketsToArray<ApiKeyConsumedCreditsBucket>(
    result.value.aggregations?.by_api_key_name?.buckets
  )) {
    consumedByApiKeyName.set(
      String(bucket.key),
      Math.round(microCreditsToCredits(bucket.credits?.value ?? 0))
    );
  }
  return consumedByApiKeyName;
}

/**
 * A single API key's Elasticsearch-derived AWU consumption for the current
 * billing cycle, scoped by `api_key_name`. Used to lazily seed the per-API-key
 * spend-cap counter on a Redis miss. Returns 0 when there is no usage or the
 * analytics read fails.
 */
export async function getEsConsumedAwuCreditsForApiKey(
  auth: Authenticator,
  { apiKeyName, cycle }: { apiKeyName: string; cycle?: BillingCycle }
): Promise<number> {
  const workspace = auth.getNonNullableWorkspace();
  const consumedByApiKeyName = await fetchConsumedAwuCreditsByApiKeyName({
    workspace,
    apiKeyNames: [apiKeyName],
    cycle,
  });
  return consumedByApiKeyName.get(apiKeyName) ?? 0;
}

/**
 * The workspace's Elasticsearch-derived *programmatic* AWU consumption for the
 * current billing cycle. The consumption index stores the billing
 * classification directly in `usage_type`; its `credit_micro` values sum to the
 * authoritative billed credits. Used to lazily seed / resync the programmatic
 * spend-cap counter. Returns the consumption, or `null` when it can't be
 * determined (no billing cycle, or the analytics read failed) — callers must
 * treat `null` as "unknown", never as 0, so a transient ES outage doesn't erase
 * a live counter on resync.
 */
export async function getEsConsumedProgrammaticAwuCredits(
  auth: Authenticator,
  { cycle }: { cycle?: BillingCycle }
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();

  const resolvedCycle = cycle ?? (await resolveMetronomeCycle(workspace));
  if (!resolvedCycle) {
    return null;
  }
  const { cycleStart, cycleEnd } = resolvedCycle;

  const result = await searchConsumptionAnalytics<
    never,
    { credits?: estypes.AggregationsSumAggregate }
  >(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          { term: { usage_type: USAGE_TYPE_PROGRAMMATIC } },
          {
            range: {
              completed_at: {
                gte: cycleStart.toISOString(),
                lte: cycleEnd.toISOString(),
              },
            },
          },
        ],
      },
    },
    {
      aggregations: { credits: { sum: { field: "credit_micro" } } },
      size: 0,
    }
  );
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "[MembersUsage] Failed to read programmatic consumed credits from consumption analytics index"
    );
    return null;
  }

  return Math.max(
    0,
    Math.round(
      microCreditsToCredits(result.value.aggregations?.credits?.value ?? 0)
    )
  );
}

/**
 * The workspace's total Elasticsearch-derived AWU consumption for the
 * current billing cycle.
 */
export async function getEsConsumedAwuCreditsForWorkspace(
  workspace: LightWorkspaceType,
  { cycle }: { cycle: BillingCycle }
): Promise<number | null> {
  const { cycleStart, cycleEnd } = cycle;

  const result = await searchConsumptionAnalytics<
    never,
    { credits?: estypes.AggregationsSumAggregate }
  >(
    {
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          {
            range: {
              completed_at: {
                gte: cycleStart.toISOString(),
                lte: cycleEnd.toISOString(),
              },
            },
          },
        ],
      },
    },
    {
      aggregations: { credits: { sum: { field: "credit_micro" } } },
      size: 0,
    }
  );
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId: workspace.sId },
      "[MembersUsage] Failed to read total consumed credits from analytics index"
    );
    return null;
  }

  return Math.max(
    0,
    Math.round(
      microCreditsToCredits(result.value.aggregations?.credits?.value ?? 0)
    )
  );
}

async function fetchPerUserUsageCreditsForMembersTable({
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  userIds,
}: {
  workspaceId: string;
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
  userIds: string[];
}): Promise<Map<string, number>> {
  if (!metronomeCustomerId || !metronomeContractId || userIds.length === 0) {
    return new Map();
  }
  try {
    return await getPerUserAwuUsage({
      workspaceId,
      metronomeCustomerId,
      metronomeContractId,
      userIds,
    });
  } catch (err) {
    // No uncached fallback (see fetchSeatDataForMembersTable).
    logger.warn(
      { err: normalizeError(err), metronomeCustomerId },
      "[MembersUsage] Failed to read cached per-user usage, degrading to empty map"
    );
    return new Map();
  }
}

async function fetchConsumedAwuCreditsFromMetronomeByUserId({
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  users,
}: {
  workspaceId: string;
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
  users: { sId: string; seatType: MembershipSeatType | null }[];
}): Promise<Map<string, number>> {
  if (users.length === 0) {
    return new Map();
  }
  const metronomeUserIdById = new Map(
    users.map((u) => [
      u.sId,
      u.seatType === "free" ? toFreeMetronomeUserId(u.sId) : u.sId,
    ])
  );
  const usageByMetronomeUserId = await fetchPerUserUsageCreditsForMembersTable({
    workspaceId,
    metronomeCustomerId,
    metronomeContractId,
    userIds: [...metronomeUserIdById.values()],
  });
  const consumedByUserId = new Map<string, number>();
  for (const u of users) {
    const metronomeUserId = metronomeUserIdById.get(u.sId)!;
    consumedByUserId.set(
      u.sId,
      usageByMetronomeUserId.get(metronomeUserId) ?? 0
    );
  }
  return consumedByUserId;
}

/** Exported for testing. */
export async function fetchSeatDataForMembersTable({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
}): Promise<Map<string, SeatData>> {
  if (!metronomeCustomerId || !metronomeContractId) {
    return new Map();
  }
  const seatDataResult = await getCachedSeatDataByUserId({
    metronomeCustomerId,
    contractId: metronomeContractId,
  });
  if (seatDataResult.isErr()) {
    // No uncached fallback: a failing loader means Metronome is already under
    // pressure, and refetching would amplify it (see the 429 storm of 2026-08).
    logger.warn(
      { err: seatDataResult.error, metronomeCustomerId },
      "[MembersUsage] Failed to read cached seat data, degrading to empty map"
    );
    return new Map();
  }
  const seatData = seatDataResult.value;
  // null: another process holds the fetch lock (skipIfLocked). Degrade
  // rather than piling a duplicate Metronome fan-out on top.
  if (!seatData) {
    return new Map();
  }
  return new Map(Object.entries(seatData));
}

// Live per-seat AWU balance remaining for paid (seat-managed) seats, keyed by
// userId. This is the expensive read (`listMetronomeSeatBalances`) gated to poke
// — free seats are handled separately by `fetchFreeSeatCreditsForMembersTable`.
// Always queried by explicit `seatIds`: Metronome's unfiltered seat-balances
// list silently omits most seats on contracts with a few hundred+ seats.
// Degrades to an empty map on any read failure so the table still renders.
async function fetchSeatBalancesForMembersTable({
  metronomeCustomerId,
  metronomeContractId,
  userIds,
}: {
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
  userIds: string[];
}): Promise<Map<string, number>> {
  if (!metronomeCustomerId || !metronomeContractId || userIds.length === 0) {
    return new Map();
  }
  const balanceByUserId = new Map<string, number>();
  const balancesResult = await getCachedSeatBalances({
    metronomeCustomerId,
    metronomeContractId,
    seatIds: userIds,
  });
  if (balancesResult.isErr()) {
    logger.warn(
      { err: balancesResult.error, metronomeCustomerId },
      "[MembersUsage] Failed to fetch seat balances, degrading to empty map"
    );
    return balanceByUserId;
  }
  const balances = balancesResult.value;
  if (balances === null) {
    return balanceByUserId;
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  for (const seat of balances) {
    const awu = seat.balances.find((b) => b.credit_type_id === awuCreditTypeId);
    if (awu) {
      balanceByUserId.set(seat.seat_id, awu.balance);
    }
  }
  return balanceByUserId;
}

// Per-user free-seat credit data, keyed by userId: live remaining balance
// (`freeBalanceByUserId`) and granted total (`freeStartingByUserId`). Free seats
// hold a per-user customer credit rather than a seat balance, and a Dust rep can
// raise a single member's grant (see the `grant-user-free-credits` poke plugin),
// so every surface reads each free member's real allowance/balance from their
// credit rather than the fixed seat-type constant. This is a single
// `credits.list` read, so — unlike the paid-seat balances above — it runs on the
// customer usage page too, not just poke. Degrades to empty maps on read failure.
async function fetchFreeSeatCreditsForMembersTable({
  metronomeCustomerId,
}: {
  metronomeCustomerId: string | null;
}): Promise<{
  freeBalanceByUserId: Map<string, number>;
  freeStartingByUserId: Map<string, number>;
}> {
  const freeBalanceByUserId = new Map<string, number>();
  const freeStartingByUserId = new Map<string, number>();
  if (!metronomeCustomerId) {
    return { freeBalanceByUserId, freeStartingByUserId };
  }
  const perUserCreditBalances = await getCachedCustomerPerUserCreditBalances({
    metronomeCustomerId,
    contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
  });
  if (perUserCreditBalances.isOk()) {
    for (const [
      userId,
      { balanceAwu, startingBalanceAwu },
    ] of perUserCreditBalances.value) {
      freeBalanceByUserId.set(userId, balanceAwu);
      freeStartingByUserId.set(userId, startingBalanceAwu);
    }
  } else {
    logger.warn(
      { err: perUserCreditBalances.error, metronomeCustomerId },
      "[MembersUsage] Failed to fetch per-user credit balances, skipping"
    );
  }
  return { freeBalanceByUserId, freeStartingByUserId };
}

export async function sumActiveMembersPoolConsumedCredits({
  auth,
  metronomeCustomerId,
  metronomeContractId,
}: {
  auth: Authenticator;
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
}): Promise<number | null> {
  if (!metronomeCustomerId || !metronomeContractId) {
    return null;
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace: auth.getNonNullableWorkspace(),
  });
  if (memberships.length === 0) {
    return 0;
  }
  const users = await UserResource.fetchByModelIds(
    memberships.map((m) => m.userId)
  );
  const userByModelId = new Map(users.map((u) => [u.id, u]));
  const members = memberships.flatMap((m) => {
    const user = userByModelId.get(m.userId);
    return user ? [{ sId: user.sId, seatType: m.seatType ?? null }] : [];
  });

  // This function itself runs inside an outer Promise.all (getAwuPoolCurrentCycleUncached)
  // alongside pure external calls, so the three fetchers below must stay Metronome/Redis-only.
  // If one of them ever needs a DB read, pull it out and sequence it before this Promise.all
  // instead of adding it here.
  const [consumedByUserId, { freeStartingByUserId }, seatDataByUserId] =
    await Promise.all([
      fetchConsumedAwuCreditsFromMetronomeByUserId({
        workspaceId: auth.getNonNullableWorkspace().sId,
        metronomeCustomerId,
        metronomeContractId,
        users: members,
      }),
      fetchFreeSeatCreditsForMembersTable({ metronomeCustomerId }),
      fetchSeatDataForMembersTable({
        metronomeCustomerId,
        metronomeContractId,
      }),
    ]);

  let sumConsumedFromPoolAwuCredits = 0;
  for (const member of members) {
    const totalConsumedCredits = consumedByUserId.get(member.sId) ?? 0;
    const freeStartingBalanceAwu =
      member.seatType === "free"
        ? (freeStartingByUserId.get(member.sId) ?? null)
        : null;
    const effectiveAllocationAwu =
      freeStartingBalanceAwu ??
      seatDataByUserId.get(member.sId)?.awuAllocation ??
      0;
    const consumedFromAllowanceAwuCredits = Math.min(
      totalConsumedCredits,
      effectiveAllocationAwu
    );
    sumConsumedFromPoolAwuCredits +=
      totalConsumedCredits - consumedFromAllowanceAwuCredits;
  }
  return sumConsumedFromPoolAwuCredits;
}

/**
 * Resolve the inputs needed to compute the effective per-user spend limit for
 * the members table:
 *   - the per-seat-type default cap totals, derived from the pool-only
 *     workspace default
 *     (`credit_usage_configurations.defaultPoolCapAwuCredits`) plus each
 *     seat type's allowance
 *   - the per-seat-type seat allowances, used to derive the total threshold
 *     from the pool-only override persisted on each membership
 *   - the per-user override and per-seat-type default alerts, fetched from
 *     Metronome only when alert deep links are requested (the thresholds
 *     come from the DB)
 */
async function fetchEffectivePerUserSpendLimits({
  metronomeCustomerId,
  workspaceId,
  defaultPoolCapAwuCredits,
  includeAlertLinks,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  defaultPoolCapAwuCredits: number;
  includeAlertLinks: boolean;
}): Promise<{
  perUserOverrideAlerts: Map<string, MetronomeCapAlertIds>;
  defaultCapAwuCreditsBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, number>
  >;
  defaultCapAlertsBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>
  >;
  seatAllowanceBySeatType: Partial<Record<NormalizedPoolLimitSeatType, number>>;
}> {
  if (!metronomeCustomerId) {
    return {
      perUserOverrideAlerts: new Map(),
      defaultCapAwuCreditsBySeatType: {},
      defaultCapAlertsBySeatType: {},
      seatAllowanceBySeatType: {},
    };
  }

  const [perUserOverrideAlerts, defaultCapAlertsBySeatType] = await Promise.all(
    [
      includeAlertLinks
        ? fetchPerUserCapAlertIds({ metronomeCustomerId, workspaceId })
        : Promise.resolve(new Map<string, MetronomeCapAlertIds>()),
      includeAlertLinks
        ? fetchDefaultCapsBySeatType({ metronomeCustomerId, workspaceId })
        : Promise.resolve({}),
    ]
  );

  let seatAllowanceBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, number>
  > = {};
  try {
    seatAllowanceBySeatType =
      await getSeatAllowancesByNormalizedSeatType(workspaceId);
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to resolve seat allowances, degrading to pool-only thresholds"
    );
  }

  const defaultCapAwuCreditsBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, number>
  > = {};
  for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
    defaultCapAwuCreditsBySeatType[seatType] =
      defaultPoolCapAwuCredits + (seatAllowanceBySeatType[seatType] ?? 0);
  }

  return {
    perUserOverrideAlerts,
    defaultCapAwuCreditsBySeatType,
    defaultCapAlertsBySeatType,
    seatAllowanceBySeatType,
  };
}

async function fetchPerUserCapAlertIds({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Map<string, MetronomeCapAlertIds>> {
  try {
    return new Map(
      Object.entries(
        await getCachedPerUserCapAlertIds({
          metronomeCustomerId,
          workspaceId,
        })
      )
    );
  } catch (err) {
    // No uncached fallback (see fetchSeatDataForMembersTable).
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to read cached per-user spend cap alert ids, degrading to empty map"
    );
    return new Map();
  }
}

async function fetchDefaultCapsBySeatType({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<
  Partial<Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>>
> {
  try {
    return await getCachedDefaultCapThresholdsBySeatType({
      metronomeCustomerId,
      workspaceId,
    });
  } catch (err) {
    // No uncached fallback (see fetchSeatDataForMembersTable).
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to read cached default spend caps by seat type, degrading to empty result"
    );
    return {};
  }
}

/**
 * Compute the fraction of per-user cap credits still available for `userId`
 * in the current billing period (0–1). Returns `null` when no cap is
 * configured for this user (treat as unlimited).
 *
 * Reuses the same cached fetchers as `getMembersUsage` so repeated calls
 * within the same cache window are free.
 */
export async function fetchRemainingCapCreditsPercentageForUser({
  metronomeCustomerId,
  workspaceId,
  userId,
  seatType,
  poolCapOverrideAwuCredits,
  groupCapAwuCredits,
  defaultPoolCapAwuCredits,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  userId: string;
  seatType: MembershipSeatType | null | undefined;
  poolCapOverrideAwuCredits: number | null;
  // Max group cap (pool-only, excluding seat allowance) across the user's
  // groups; null when none carry a cap.
  groupCapAwuCredits: number | null;
  defaultPoolCapAwuCredits: number;
}): Promise<number | null> {
  const contract = metronomeCustomerId
    ? await getActiveContract(workspaceId)
    : null;
  const metronomeContractId = contract?.id ?? null;

  const metronomeUserId =
    seatType === "free" ? toFreeMetronomeUserId(userId) : userId;
  const [
    perUserTotalConsumedCredits,
    { defaultCapAwuCreditsBySeatType, seatAllowanceBySeatType },
  ] = await Promise.all([
    fetchPerUserUsageCreditsForMembersTable({
      workspaceId,
      metronomeCustomerId,
      metronomeContractId,
      userIds: [metronomeUserId],
    }),
    fetchEffectivePerUserSpendLimits({
      metronomeCustomerId,
      workspaceId,
      defaultPoolCapAwuCredits,
      includeAlertLinks: false,
    }),
  ]);

  const normalizedSeatType = normalizeToPoolLimitSeatType(seatType);
  const defaultAwuCredits = normalizedSeatType
    ? (defaultCapAwuCreditsBySeatType[normalizedSeatType] ?? null)
    : null;

  // Mirror `getMembersUsage`: the override threshold stored on the membership is
  // the pool-only portion; add the seat allowance to get the total threshold.
  // "none" seat users have no pool access, so their override is irrelevant.
  const overrideAwuCredits =
    poolCapOverrideAwuCredits !== null && seatType !== "none"
      ? poolCapOverrideAwuCredits +
        (normalizedSeatType
          ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
          : 0)
      : null;

  // Max group cap (pool-only) + seat allowance, matching override/default units.
  // Only pool-bearing seats get a group cap.
  const groupCapTotalAwuCredits =
    groupCapAwuCredits !== null && normalizedSeatType !== null
      ? groupCapAwuCredits + (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
      : null;

  const spendLimitAwuCredits = resolveEffectiveSpendLimitAwuCredits({
    overrideAwuCredits,
    groupCapAwuCredits: groupCapTotalAwuCredits,
    defaultAwuCredits,
  });

  if (spendLimitAwuCredits === null) {
    return null;
  }

  const consumed = perUserTotalConsumedCredits.get(metronomeUserId) ?? 0;
  return Math.max(0, (spendLimitAwuCredits - consumed) / spendLimitAwuCredits);
}

/**
 * Resolves a single user's effective per-user spend cap in AWU credits (incl.
 * the seat allowance): per-user override > max group cap > seat-type/workspace
 * default. Returns `null` when no cap applies (e.g. "none"/free seats with no
 * pool cap). Mirrors the resolution used to populate the members-usage table —
 * the canonical cap resolution (workspace default / group / user override).
 */
export async function getEffectiveSpendCapAwuCreditsForUser(
  auth: Authenticator,
  { user }: { user: UserResource }
): Promise<number | null> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return null;
  }

  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  const [
    { defaultCapAwuCreditsBySeatType, seatAllowanceBySeatType },
    groupCapByUserModelId,
  ] = await Promise.all([
    fetchEffectivePerUserSpendLimits({
      metronomeCustomerId: metronomeCustomerId ?? null,
      workspaceId: workspace.sId,
      defaultPoolCapAwuCredits:
        creditUsageConfig?.defaultPoolCapAwuCredits ?? 0,
      includeAlertLinks: false,
    }),
    GroupResource.listMaxPoolCapAwuCreditsByUserModelIdInWorkspace({
      workspace,
      userModelIds: [user.id],
    }),
  ]);

  const normalizedSeatType = normalizeToPoolLimitSeatType(membership.seatType);
  const seatAllowance = normalizedSeatType
    ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
    : 0;

  const defaultAwuCredits = normalizedSeatType
    ? (defaultCapAwuCreditsBySeatType[normalizedSeatType] ?? null)
    : null;

  // "none" seat users have no pool access, so their override is irrelevant.
  const overrideAwuCredits =
    membership.poolCapOverrideAwuCredits !== null &&
    membership.seatType !== "none"
      ? membership.poolCapOverrideAwuCredits + seatAllowance
      : null;

  const groupPoolCapAwuCredits = groupCapByUserModelId.get(user.id) ?? null;
  const groupCapAwuCredits =
    groupPoolCapAwuCredits !== null && normalizedSeatType !== null
      ? groupPoolCapAwuCredits + seatAllowance
      : null;

  return resolveEffectiveSpendLimitAwuCredits({
    overrideAwuCredits,
    groupCapAwuCredits,
    defaultAwuCredits,
  });
}

/**
 * Backfills/resyncs every active member's Redis fixed-window spend-cap counter
 * for the current billing cycle from the authoritative Elasticsearch usage,
 * overwriting the counter (SET) so it matches ES. Use after enabling the cap or
 * to repair drift (the counter otherwise only accrues from live messages and
 * starts at 0 mid-cycle). Returns the number of users whose counter was written.
 *
 * Resyncs whichever cycle the workspace is bucketed on — the Metronome contract
 * billing period, or the UTC calendar month for workspaces without a contract —
 * so it writes the same Redis keys enforcement reads.
 */
export async function resyncSpendLimitCountersFromEsUsage(
  auth: Authenticator
): Promise<Result<{ updatedUserCount: number }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const cycle =
    spendLimitCycleOverrideForAuth(auth) ??
    (await resolveMetronomeCycle(workspace));
  if (!cycle) {
    return new Err(
      new Error("No active Metronome billing period to resync against.")
    );
  }
  const bounds = makeSpendLimitCycleWindowBounds(
    cycle.cycleStart,
    cycle.cycleEnd
  );

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  if (memberships.length === 0) {
    return new Ok({ updatedUserCount: 0 });
  }

  const users = await UserResource.fetchByModelIds(
    memberships.map((m) => m.userId)
  );
  const userByModelId = new Map(users.map((u) => [u.id, u]));

  // Read the same Elasticsearch-derived consumption the members table shows as
  // "Consumed (ES)": keyed by user sId, with the free/paid split applied per
  // seat. This is the source of truth we overwrite the counter with.
  const freeSeatUserIds = memberships.flatMap((m) => {
    const u = userByModelId.get(m.userId);
    return u && m.seatType === "free" ? [u.sId] : [];
  });
  const consumedByUserId = await fetchConsumedAwuCreditsByUserId({
    workspace,
    userIds: users.map((u) => u.sId),
    freeSeatUserIds,
    cycle,
  });

  const results = await concurrentExecutor(
    memberships,
    async (membership) => {
      const user = userByModelId.get(membership.userId);
      if (!user) {
        return false;
      }
      const consumed = consumedByUserId.get(user.sId) ?? 0;
      const setResult = await setFixedWindowCount({
        key: makeSpendLimitAwuCreditsRateLimitKeyForUser(
          workspace,
          user.toJSON()
        ),
        bounds,
        value: Math.max(0, roundCreditsToMicroCredits(consumed)),
        logger,
      });
      return setResult.isOk();
    },
    { concurrency: 8 }
  );

  return new Ok({ updatedUserCount: results.filter(Boolean).length });
}

/**
 * Backfill/repair the per-API-key spend-cap counters for a workspace from
 * Elasticsearch, overwriting each capped key's counter (SET) so it matches ES.
 * Use after enabling the cap or to repair drift (the counter otherwise only
 * accrues from live messages and starts at 0 mid-cycle). Only keys with a
 * configured `monthlyCapAwuCredits` are seeded. Returns the number of keys
 * whose counter was written.
 */
export async function resyncApiKeySpendLimitCountersFromEsUsage(
  auth: Authenticator
): Promise<Result<{ updatedKeyCount: number }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const cycle = await resolveMetronomeCycle(workspace);
  if (!cycle) {
    return new Err(
      new Error("No active Metronome billing period to resync against.")
    );
  }
  const bounds = makeSpendLimitCycleWindowBounds(
    cycle.cycleStart,
    cycle.cycleEnd
  );

  const keys = await KeyResource.listNonSystemKeysByWorkspace(workspace);
  // The cap is per-name (Metronome aggregates spend by `api_key_name`; names
  // are unique among active keys), so only active, capped keys are seeded.
  const cappedKeys = keys.filter(
    (key) => key.isActive && key.monthlyCapAwuCredits !== null
  );
  if (cappedKeys.length === 0) {
    return new Ok({ updatedKeyCount: 0 });
  }

  const consumedByApiKeyName = await fetchConsumedAwuCreditsByApiKeyName({
    workspace,
    apiKeyNames: cappedKeys.map((key) => key.name),
    cycle,
  });

  const results = await concurrentExecutor(
    cappedKeys,
    async (key) => {
      const consumed = consumedByApiKeyName.get(key.name) ?? 0;
      const setResult = await setFixedWindowCount({
        key: makeApiKeySpendLimitAwuCreditsRateLimitKey(key.id),
        bounds,
        value: Math.max(0, roundCreditsToMicroCredits(consumed)),
        logger,
      });
      return setResult.isOk();
    },
    { concurrency: 8 }
  );

  return new Ok({ updatedKeyCount: results.filter(Boolean).length });
}

/**
 * Backfill/repair the workspace programmatic spend-cap counter from
 * Elasticsearch, overwriting it (SET) with the programmatic AWU consumption for
 * the current cycle. No-op (not seeded) when there is no positive programmatic
 * cap — that case defers to the programmatic credit-state machine, not the
 * counter.
 */
export async function resyncProgrammaticSpendLimitCounterFromEsUsage(
  auth: Authenticator
): Promise<Result<{ programmaticCounterSeeded: boolean }, Error>> {
  const workspace = auth.getNonNullableWorkspace();

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  const cap = config?.programmaticMonthlyCapAwuCredits ?? 0;
  if (cap <= 0) {
    return new Ok({ programmaticCounterSeeded: false });
  }

  const cycle = await resolveMetronomeCycle(workspace);
  if (!cycle) {
    return new Err(
      new Error("No active Metronome billing period to resync against.")
    );
  }
  const bounds = makeSpendLimitCycleWindowBounds(
    cycle.cycleStart,
    cycle.cycleEnd
  );

  const consumed = await getEsConsumedProgrammaticAwuCredits(auth, { cycle });
  if (consumed === null) {
    // The Elasticsearch read failed: skip the SET so a transient outage can't
    // overwrite a valid live counter with 0 and disable the backup cap.
    return new Err(
      new Error(
        "Failed to read programmatic consumption from Elasticsearch; skipped resync to avoid erasing the counter."
      )
    );
  }
  const setResult = await setFixedWindowCount({
    key: makeProgrammaticSpendLimitAwuCreditsRateLimitKeyForWorkspace(
      workspace
    ),
    bounds,
    value: Math.max(0, roundCreditsToMicroCredits(consumed)),
    logger,
  });
  return new Ok({ programmaticCounterSeeded: setResult.isOk() });
}

export type GetMemberUsageResponseBody = {
  member: MemberUsageType | null;
  // Optional for backward compatibility with clients deployed before target
  // information was added to this endpoint.
  creditUsageStatus?: CreditUsageStatus | null;
  // Optional for backward compatibility with clients deployed before premium
  // rolling-window usage was added to this endpoint.
  premiumModelUsage?: PremiumModelMessageUsage | null;
};

export async function getMemberUsage({
  auth,
}: {
  auth: Authenticator;
}): Promise<GetMemberUsageResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const userResource = auth.user();

  if (!userResource) {
    return { member: null };
  }

  const { metronomeCustomerId } = workspace;
  const metronomeContractId = subscription?.metronomeContractId ?? null;
  const userId = userResource.sId;
  const plan = auth.plan();
  const cycleOverride = spendLimitCycleOverrideForAuth(auth);
  const billingCyclePromise =
    plan && isCreditPricedPlan(plan)
      ? cycleOverride
        ? Promise.resolve(cycleOverride)
        : resolveMetronomeCycle(workspace)
      : Promise.resolve(null);
  const premiumModelUsagePromise =
    plan && !isCreditPricedPlan(plan)
      ? getPremiumModelMessageUsage({ workspace, user: userResource })
      : Promise.resolve(null);

  // The workspace-wide default pool cap lives on the credit-usage
  // configuration row (created lazily; absent → no default configured).
  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  const [
    membershipsResult,
    perUserTotalConsumedCredits,
    seatDataByUserId,
    perUserSpendLimits,
    billingCycle,
    premiumModelUsage,
  ] = await Promise.all([
    MembershipResource.getActiveMemberships({
      workspace,
      users: [userResource],
    }),
    fetchPerUserUsageCreditsForMembersTable({
      workspaceId: workspace.sId,
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
      // Include both forms; seat type is resolved from the membership fetched
      // in the same Promise.all, so the correct key is picked after resolution.
      userIds: [userId, toFreeMetronomeUserId(userId)],
    }),
    fetchSeatDataForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    fetchEffectivePerUserSpendLimits({
      metronomeCustomerId: metronomeCustomerId ?? null,
      workspaceId: workspace.sId,
      defaultPoolCapAwuCredits:
        creditUsageConfig?.defaultPoolCapAwuCredits ?? 0,
      includeAlertLinks: false,
    }),
    billingCyclePromise,
    premiumModelUsagePromise,
  ]);

  const { defaultCapAwuCreditsBySeatType, seatAllowanceBySeatType } =
    perUserSpendLimits;
  const { memberships } = membershipsResult;
  const membership = memberships.find((m) => m.userId === userResource.id);

  if (!membership) {
    return { member: null };
  }

  const [groupNamesByUserModelId, maxPoolCapGroupByUserModelId] =
    await Promise.all([
      GroupResource.listGroupNamesByUserModelIdInWorkspace({
        auth,
        userModelIds: [userResource.id],
        groupKinds: [...CAP_ELIGIBLE_GROUP_KINDS],
      }),
      GroupResource.listMaxPoolCapGroupByUserModelIdInWorkspace({
        workspace,
        userModelIds: [userResource.id],
      }),
    ]);

  const metronomeUserId =
    membership.seatType === "free" ? toFreeMetronomeUserId(userId) : userId;
  const totalConsumedCredits =
    perUserTotalConsumedCredits.get(metronomeUserId) ?? 0;
  const seatData = seatDataByUserId.get(userId);
  const awuAllocation = seatData?.awuAllocation ?? 0;

  // Free seats draw from a per-user credit whose granted total a Dust rep can
  // raise (see the `grant-user-free-credits` poke plugin). Read the live balance
  // and granted total so the "Your Credits" bar reflects the member's real
  // allowance and lifetime usage rather than the fixed seat-type constant.
  // Degrades to the constant on read failure.
  let freeSeatBalanceAwu: number | null = null;
  let freeSeatAllowanceAwu: number | null = null;
  if (membership.seatType === "free" && metronomeCustomerId) {
    const balances = await getCachedCustomerPerUserCreditBalances({
      metronomeCustomerId,
      contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
    });
    if (balances.isOk()) {
      const entry = balances.value.get(userId);
      if (entry) {
        freeSeatBalanceAwu = entry.balanceAwu;
        freeSeatAllowanceAwu = entry.startingBalanceAwu;
      }
    } else {
      logger.warn(
        { err: balances.error, workspaceId: workspace.sId, userId },
        "[MembersUsage] Failed to fetch free-seat credit for member usage"
      );
    }
  }
  const effectiveAllocationAwu = freeSeatAllowanceAwu ?? awuAllocation;

  const consumedFromAllowanceAwuCredits = Math.min(
    totalConsumedCredits,
    effectiveAllocationAwu
  );
  const consumedFromPoolAwuCredits =
    totalConsumedCredits - consumedFromAllowanceAwuCredits;

  const normalizedSeatType = normalizeToPoolLimitSeatType(membership.seatType);
  const defaultAwuCredits = normalizedSeatType
    ? (defaultCapAwuCreditsBySeatType[normalizedSeatType] ?? null)
    : null;
  // "none" seat users have no pool access, so their override is irrelevant.
  const overrideAwuCredits =
    membership.poolCapOverrideAwuCredits !== null &&
    membership.seatType !== "none"
      ? membership.poolCapOverrideAwuCredits +
        (normalizedSeatType
          ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
          : 0)
      : null;
  // Free seats have no pool, so their total spend cap is just the seat
  // allowance (allowance + 0 pool) — like every other seat the cap includes the
  // allowance, it just has no pool headroom on top. There's no default cap alert
  // for free (normalizeToPoolLimitSeatType is null), so we supply it explicitly.
  // Use the member's real free-credit total (which a rep may have raised) rather
  // than the constant. "none" seats have no seat and no pool access, so their
  // cap is explicitly 0 rather than falling through to an unlimited `null`.
  const effectiveDefaultAwuCredits =
    membership.seatType === "free"
      ? effectiveAllocationAwu
      : membership.seatType === "none"
        ? 0
        : defaultAwuCredits;

  // Max group cap (pool-only) + seat allowance, matching override/default units.
  // Only pool-bearing seats (pro/max/workspace) get a group cap.
  const maxPoolCapGroup = maxPoolCapGroupByUserModelId.get(userResource.id);
  const groupPoolCapAwuCredits = maxPoolCapGroup?.capAwuCredits ?? null;
  const groupCapAwuCredits =
    groupPoolCapAwuCredits !== null && normalizedSeatType !== null
      ? groupPoolCapAwuCredits +
        (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
      : null;

  const spendLimitSource = resolveEffectiveSpendLimitSource({
    overrideAwuCredits,
    groupCapAwuCredits,
    defaultAwuCredits: effectiveDefaultAwuCredits,
  });

  const spendLimitAwuCredits = resolveEffectiveSpendLimitAwuCredits({
    overrideAwuCredits,
    groupCapAwuCredits,
    defaultAwuCredits: effectiveDefaultAwuCredits,
  });

  const member: MemberUsageType = {
    sId: userId,
    name: userResource.fullName() || userResource.name,
    email: userResource.email ?? null,
    image: userResource.imageUrl ?? null,
    groups: groupNamesByUserModelId.get(userResource.id) ?? [],
    seatType: membership.seatType ?? null,
    memberUsageLimit:
      effectiveAllocationAwu > 0 ? effectiveAllocationAwu : null,
    seatBalanceAwu: freeSeatBalanceAwu,
    consumedAwuCredits: totalConsumedCredits,
    consumedFromAllowanceAwuCredits,
    consumedFromPoolAwuCredits,
    billingFrequency:
      seatData?.billingFrequency ??
      deriveWorkspaceSeatBillingFrequency(membership.seatType ?? null),
    nextCreditResetAt: seatData?.nextCreditResetAt ?? null,
    scheduledSeatType: null,
    scheduledSeatChangeAt: null,
    spendLimitAwuCredits,
    rateLimiterSpendAwuCredits: null,
    metronomeConsumedAwuCredits: null,
    spendLimitSource,
    spendLimitGroupName:
      spendLimitSource === "group"
        ? (maxPoolCapGroup?.groupName ?? null)
        : null,
    spendLimitAlertId: null,
    spendLimitWarningAlertId: null,
    freeCreditLowAlert: null,
    freeCreditEmptyAlert: null,
    creditState: membership.creditState,
    nearLimit: false,
    seatUsageTarget: null,
    overallUsageTarget: null,
  };

  return {
    member,
    premiumModelUsage,
    creditUsageStatus:
      billingCycle && spendLimitAwuCredits !== null
        ? computeCreditUsageStatus({
            consumedAwuCredits: totalConsumedCredits,
            limitAwuCredits: spendLimitAwuCredits,
            billingCycle,
            nowMs: Date.now(),
          })
        : null,
  };
}

// Resolve the member user sIds matching a base seat-type filter, querying the
// memberships table directly (a base tier matches its monthly + yearly
// variants). Seat type isn't held in the user search index, so we hand these
// ids to Elasticsearch as an allowlist and let it own search/sort/pagination
// over the filtered set. We don't do it in ES because seats can be effective
// at the end of the billing period so it would add a lot of complexity to
// keep the index up to date with the effective seat type for each user.
async function resolveSeatTypeFilterUserIds({
  workspace,
  seatType,
}: {
  workspace: LightWorkspaceType;
  seatType: MembershipSeatType;
}): Promise<string[]> {
  const seatTypes = MEMBERSHIP_SEAT_TYPES.filter(
    (t) => toBaseSeatType(t) === seatType
  );
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    seatTypes,
  });
  return (
    memberships
      .map((m) => m.user?.sId)
      // defensive typecheck: in practice this should never happen because the
      // memberships are inner-joined to users, but the type system doesn't
      // know that.
      .filter((sId): sId is string => Boolean(sId))
  );
}

// Resolve the active member user sIds of a group (by sId). Handed to
// Elasticsearch as an allowlist, like the seat-type filter. An unknown or
// unreadable group resolves to an empty set (empty page).
async function resolveGroupFilterUserIds({
  auth,
  groupId,
}: {
  auth: Authenticator;
  groupId: string;
}): Promise<string[]> {
  const groupRes = await GroupResource.fetchById(auth, groupId);
  if (groupRes.isErr()) {
    return [];
  }
  const members = await groupRes.value.getActiveMembers(auth);
  return members.map((u) => u.sId);
}

// Resolve the member user sIds matching a credit-state filter. `creditState`
// isn't a DB-indexed or search-indexed field, so — like the seat-type filter —
// we fetch every active membership and filter in JS to build an allowlist.
async function resolveCreditStateFilterUserIds({
  workspace,
  creditState,
}: {
  workspace: LightWorkspaceType;
  creditState: UserCreditState;
}): Promise<string[]> {
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  return memberships
    .filter((m) => m.creditState === creditState)
    .map((m) => m.user?.sId)
    .filter((sId): sId is string => Boolean(sId));
}

async function resolveSeatAndGroupRestriction({
  auth,
  workspace,
  seatType,
  groupId,
  creditState,
}: {
  auth: Authenticator;
  workspace: LightWorkspaceType;
  seatType?: MembershipSeatType;
  groupId?: string;
  creditState?: UserCreditState;
}): Promise<string[] | undefined> {
  const restrictionSets: string[][] = [];
  if (seatType) {
    restrictionSets.push(
      await resolveSeatTypeFilterUserIds({ workspace, seatType })
    );
  }
  if (groupId) {
    restrictionSets.push(await resolveGroupFilterUserIds({ auth, groupId }));
  }
  if (creditState) {
    restrictionSets.push(
      await resolveCreditStateFilterUserIds({ workspace, creditState })
    );
  }
  if (restrictionSets.length === 0) {
    return undefined;
  }
  const [firstSet, ...otherSets] = restrictionSets;
  return otherSets.reduce((acc, set) => {
    const allowed = new Set(set);
    return acc.filter((sId) => allowed.has(sId));
  }, firstSet);
}

export async function resolveMatchingMemberUserIds({
  auth,
  filter,
}: {
  auth: Authenticator;
  filter: {
    seatType?: MembershipSeatType;
    groupId?: string;
    search?: string;
    creditState?: UserCreditState;
  };
}): Promise<Result<string[], Error>> {
  const workspace = auth.getNonNullableWorkspace();
  const restrictToUserIds = await resolveSeatAndGroupRestriction({
    auth,
    workspace,
    seatType: filter.seatType,
    groupId: filter.groupId,
    creditState: filter.creditState,
  });
  if (restrictToUserIds !== undefined && restrictToUserIds.length === 0) {
    return new Ok([]);
  }
  // Propagate search failures (e.g. an Elasticsearch outage) instead of masking
  // them as an empty result. This is a write path, so the caller must be able
  // to tell "no match" from "lookup failed".
  const result = await UserResource.searchAllUsers(auth, {
    searchTerm: filter.search ?? "",
    restrictToUserIds,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(result.value.users.map((u) => u.sId));
}

// "name"/"email" live in the user search index, which owns sort + pagination
// for those columns. Every other column is not indexed, so to sort by it we
// fetch the full matching set with Elasticsearch `search_after`, rank it by
// the relevant signal, sort in-app, then slice the requested page.
async function resolveMembersUsagePageUsers({
  auth,
  workspace,
  paginationParams,
  restrictToUserIds,
}: {
  auth: Authenticator;
  workspace: LightWorkspaceType;
  paginationParams: MembersUsagePaginationInput;
  restrictToUserIds: string[] | undefined;
}): Promise<
  Result<
    {
      users: UserResource[];
      total: number;
    },
    Error
  >
> {
  const { orderColumn, orderDirection, offset, limit } = paginationParams;
  const searchTerm = paginationParams.search ?? "";

  // "name"/"email" are indexed: let Elasticsearch own sort and pagination.
  if (orderColumn === "name" || orderColumn === "email") {
    return UserResource.searchUsers(auth, {
      searchTerm,
      offset,
      limit,
      orderBy: { field: orderColumn, direction: orderDirection },
      restrictToUserIds,
    });
  }

  const allUsersResult = await UserResource.searchAllUsers(auth, {
    searchTerm,
    restrictToUserIds,
  });
  if (allUsersResult.isErr()) {
    return allUsersResult;
  }
  const { users: allUsers, total } = allUsersResult.value;

  // Every remaining sort column derives its key from the active membership
  // (seat type, credit state, or the seat-type split for consumed credits).
  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
    users: allUsers,
  });
  const membershipByUserModelId = new Map(
    memberships.map((m) => [m.userId, m])
  );

  const sortKeyByUserId = new Map<string, number | string>();
  const overageLimitByUserId = new Map<string, number>();
  switch (orderColumn) {
    case "consumedAwuCredits": {
      // Split consumed credits on seat type so free-seat users sort by their
      // free-seat usage and everyone else by their paid-seat usage.
      const freeSeatUserIds = allUsers.flatMap((u) =>
        membershipByUserModelId.get(u.id)?.seatType === "free" ? [u.sId] : []
      );
      const creditsByUserId = await fetchConsumedAwuCreditsByUserId({
        workspace,
        userIds: allUsers.map((u) => u.sId),
        freeSeatUserIds,
        cycle: spendLimitCycleOverrideForAuth(auth),
      });
      for (const u of allUsers) {
        sortKeyByUserId.set(u.sId, creditsByUserId.get(u.sId) ?? 0);
      }
      break;
    }
    case "consumedFromPoolAwuCredits": {
      const freeSeatUserIds = allUsers.flatMap((u) =>
        membershipByUserModelId.get(u.id)?.seatType === "free" ? [u.sId] : []
      );
      const creditUsageConfig =
        await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
      const [
        consumedByUserId,
        { defaultCapAwuCreditsBySeatType, seatAllowanceBySeatType },
        freeSeatCredits,
      ] = await Promise.all([
        fetchConsumedAwuCreditsFromMetronomeByUserId({
          workspaceId: workspace.sId,
          metronomeCustomerId: workspace.metronomeCustomerId,
          metronomeContractId: auth.subscription()?.metronomeContractId ?? null,
          users: allUsers.map((u) => ({
            sId: u.sId,
            seatType: membershipByUserModelId.get(u.id)?.seatType ?? null,
          })),
        }),
        fetchEffectivePerUserSpendLimits({
          metronomeCustomerId: workspace.metronomeCustomerId,
          workspaceId: workspace.sId,
          defaultPoolCapAwuCredits:
            creditUsageConfig?.defaultPoolCapAwuCredits ?? 0,
          includeAlertLinks: false,
        }),
        freeSeatUserIds.length > 0
          ? fetchFreeSeatCreditsForMembersTable({
              metronomeCustomerId: workspace.metronomeCustomerId,
            })
          : Promise.resolve({
              freeBalanceByUserId: new Map<string, number>(),
              freeStartingByUserId: new Map<string, number>(),
            }),
      ]);
      const groupCapByUserModelId =
        await GroupResource.listMaxPoolCapAwuCreditsByUserModelIdInWorkspace({
          workspace,
          userModelIds: allUsers.map((u) => u.id),
        });
      const { freeStartingByUserId } = freeSeatCredits;
      for (const u of allUsers) {
        const membership = membershipByUserModelId.get(u.id);
        const seatType = membership?.seatType ?? null;
        const normalizedSeatType = normalizeToPoolLimitSeatType(seatType);
        const seatAllowance = normalizedSeatType
          ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
          : 0;
        const totalConsumed = consumedByUserId.get(u.sId) ?? 0;
        const freeStartingBalanceAwu =
          seatType === "free"
            ? (freeStartingByUserId.get(u.sId) ?? null)
            : null;
        const effectiveAllocationAwu = freeStartingBalanceAwu ?? seatAllowance;
        const consumedFromPoolAwuCredits = Math.max(
          0,
          totalConsumed - effectiveAllocationAwu
        );
        sortKeyByUserId.set(u.sId, consumedFromPoolAwuCredits);

        const overrideAwuCredits =
          membership?.poolCapOverrideAwuCredits !== null &&
          membership?.poolCapOverrideAwuCredits !== undefined &&
          seatType !== "none"
            ? membership.poolCapOverrideAwuCredits + seatAllowance
            : null;
        const groupPoolCapAwuCredits = groupCapByUserModelId.get(u.id) ?? null;
        const groupCapAwuCredits =
          groupPoolCapAwuCredits !== null && normalizedSeatType !== null
            ? groupPoolCapAwuCredits + seatAllowance
            : null;
        const defaultAwuCredits = normalizedSeatType
          ? (defaultCapAwuCreditsBySeatType[normalizedSeatType] ?? 0)
          : 0;
        const effectiveSpendLimitAwuCredits =
          resolveEffectiveSpendLimitAwuCredits({
            overrideAwuCredits,
            groupCapAwuCredits,
            defaultAwuCredits,
          });
        overageLimitByUserId.set(
          u.sId,
          effectiveSpendLimitAwuCredits - seatAllowance
        );
      }
      break;
    }
    case "seatType": {
      for (const u of allUsers) {
        sortKeyByUserId.set(
          u.sId,
          membershipByUserModelId.get(u.id)?.seatType ?? "none"
        );
      }
      break;
    }
    case "creditState": {
      for (const u of allUsers) {
        sortKeyByUserId.set(
          u.sId,
          membershipByUserModelId.get(u.id)?.creditState ?? ""
        );
      }
      break;
    }
    case "seatUsage": {
      const freeSeatUserIds = allUsers.flatMap((u) =>
        membershipByUserModelId.get(u.id)?.seatType === "free" ? [u.sId] : []
      );
      const [consumedByUserId, seatDataByUserId, freeSeatCredits] =
        await Promise.all([
          fetchConsumedAwuCreditsFromMetronomeByUserId({
            workspaceId: workspace.sId,
            metronomeCustomerId: workspace.metronomeCustomerId,
            metronomeContractId:
              auth.subscription()?.metronomeContractId ?? null,
            users: allUsers.map((u) => ({
              sId: u.sId,
              seatType: membershipByUserModelId.get(u.id)?.seatType ?? null,
            })),
          }),
          fetchSeatDataForMembersTable({
            metronomeCustomerId: workspace.metronomeCustomerId,
            metronomeContractId:
              auth.subscription()?.metronomeContractId ?? null,
          }),
          freeSeatUserIds.length > 0
            ? fetchFreeSeatCreditsForMembersTable({
                metronomeCustomerId: workspace.metronomeCustomerId,
              })
            : Promise.resolve({
                freeBalanceByUserId: new Map<string, number>(),
                freeStartingByUserId: new Map<string, number>(),
              }),
        ]);
      const { freeBalanceByUserId, freeStartingByUserId } = freeSeatCredits;
      for (const u of allUsers) {
        const seatType = membershipByUserModelId.get(u.id)?.seatType ?? null;
        const awuAllocation = seatDataByUserId.get(u.sId)?.awuAllocation ?? 0;
        const freeStartingBalanceAwu =
          seatType === "free"
            ? (freeStartingByUserId.get(u.sId) ?? null)
            : null;
        const effectiveAllocationAwu = freeStartingBalanceAwu ?? awuAllocation;
        const consumed =
          seatType === "free"
            ? Math.max(
                0,
                effectiveAllocationAwu - (freeBalanceByUserId.get(u.sId) ?? 0)
              )
            : Math.min(
                consumedByUserId.get(u.sId) ?? 0,
                effectiveAllocationAwu
              );
        sortKeyByUserId.set(
          u.sId,
          effectiveAllocationAwu > 0
            ? Math.min(100, (consumed / effectiveAllocationAwu) * 100)
            : consumed > 0
              ? 100
              : 0
        );
      }
      break;
    }
    case "premiumMessageUsage": {
      // Count-only and pipelined into a single Redis round-trip
      const usedCountByUserId = await getPremiumModelMessageUsedCountsByUser({
        workspace,
        users: allUsers.map((u) => ({ id: u.id, sId: u.sId })),
      });
      for (const u of allUsers) {
        sortKeyByUserId.set(u.sId, usedCountByUserId.get(u.sId) ?? 0);
      }
      break;
    }
    case "fairUse": {
      // Count-only and pipelined into a single Redis round-trip
      const usedCreditsByUserId = await getFairUseAwuCreditsUsedCountsByUser({
        workspace,
        users: allUsers.map((u) => u.toJSON()),
        plan: auth.plan(),
      });
      for (const u of allUsers) {
        sortKeyByUserId.set(u.sId, usedCreditsByUserId.get(u.sId) ?? 0);
      }
      break;
    }
    default:
      assertNever(orderColumn);
  }

  const directionFactor = orderDirection === "asc" ? 1 : -1;
  const sortedUsers = [...allUsers].sort((a, b) => {
    const keyA = sortKeyByUserId.get(a.sId) ?? 0;
    const keyB = sortKeyByUserId.get(b.sId) ?? 0;
    const cmp =
      typeof keyA === "number" && typeof keyB === "number"
        ? keyA - keyB
        : String(keyA).localeCompare(String(keyB));
    if (cmp !== 0) {
      return cmp * directionFactor;
    }
    // Tiebreak on the highest overage limit, always descending
    const overageLimitA = overageLimitByUserId.get(a.sId) ?? 0;
    const overageLimitB = overageLimitByUserId.get(b.sId) ?? 0;
    if (overageLimitA !== overageLimitB) {
      return overageLimitB - overageLimitA;
    }
    // Stable, direction-independent tiebreaker so pages don't reshuffle.
    const nameA = (a.fullName() || a.name).toLowerCase();
    const nameB = (b.fullName() || b.name).toLowerCase();
    if (nameA !== nameB) {
      return nameA < nameB ? -1 : 1;
    }
    return a.sId < b.sId ? -1 : a.sId > b.sId ? 1 : 0;
  });

  return new Ok({
    users: sortedUsers.slice(offset, offset + limit),
    total,
  });
}

export async function getMembersUsage({
  auth,
  paginationParams,
  includeAlertLinks = false,
  includeSeatBalance = false,
}: {
  auth: Authenticator;
  paginationParams: MembersUsagePaginationInput;
  includeAlertLinks?: boolean;
  // Live per-seat balance read (an extra Metronome call). Poke-only — the
  // customer usage page doesn't surface it, so it stays off there.
  includeSeatBalance?: boolean;
}): Promise<GetMembersUsageResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  const metronomeContractId = subscription?.metronomeContractId ?? null;

  // Resolved up front (Redis-cached) so even empty pages carry the reset date
  // for the table header.
  const creditsResetAt = await fetchCreditsResetAt(workspace);

  // When a seat-type and/or group filter is active, resolve the matching user
  // sIds up front and restrict the search to their intersection, so pagination
  // and the returned `total` reflect the filtered set. No match (in any active
  // filter) means an empty page.
  const restrictToUserIds = await resolveSeatAndGroupRestriction({
    auth,
    workspace,
    seatType: paginationParams.seatType,
    groupId: paginationParams.groupId,
    creditState: paginationParams.creditState,
  });
  if (restrictToUserIds !== undefined && restrictToUserIds.length === 0) {
    return { members: [], total: 0, creditsResetAt };
  }

  const usersResult = await resolveMembersUsagePageUsers({
    auth,
    workspace,
    paginationParams,
    restrictToUserIds,
  });

  if (usersResult.isErr()) {
    return { members: [], total: 0, creditsResetAt };
  }

  const { users, total } = usersResult.value;

  if (users.length === 0) {
    return { members: [], total, creditsResetAt };
  }

  // The workspace-wide default pool cap lives on the credit-usage
  // configuration row (created lazily; absent → no default configured).
  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  // Memberships are needed up front to split consumed credits on seat type:
  // free-seat users are counted from `is_free_seat: true` usage, everyone else
  // from `is_free_seat: false`.
  const membershipsResult = await MembershipResource.getActiveMemberships({
    workspace,
    users,
  });
  const membershipByUserId = new Map(
    membershipsResult.memberships.map((m) => [m.userId, m])
  );
  const freeSeatUserIds = users.flatMap((u) =>
    membershipByUserId.get(u.id)?.seatType === "free" ? [u.sId] : []
  );
  // Only pro/max (and their _yearly variants) carry an individual Metronome
  // seat balance — querying free/none/workspace users too would just waste
  // calls on ids Metronome will report as not found.
  const seatBalanceEligibleUserIds = users.flatMap((u) =>
    hasMetronomeSeatBalance(membershipByUserId.get(u.id)?.seatType)
      ? [u.sId]
      : []
  );

  // Fetch Metronome data and consumed credits in parallel for the current page.
  const [
    perUserTotalConsumedCredits,
    seatDataByUserId,
    seatBalanceByUserId,
    { freeBalanceByUserId, freeStartingByUserId },
    perUserSpendLimits,
    freeCreditAlertIdsByUserId,
    groupNamesByUserModelId,
    groupCapByUserModelId,
  ] = await Promise.all([
    fetchConsumedAwuCreditsByUserId({
      workspace,
      userIds: users.map((u) => u.sId),
      freeSeatUserIds,
      // Non-credit workspaces have no Metronome billing period to anchor the
      // window on; fall back to the UTC calendar month (same window the spend
      // caps use) so consumed (ES) reflects real usage instead of 0.
      cycle: spendLimitCycleOverrideForAuth(auth),
    }),
    fetchSeatDataForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    // Paid (seat-managed) live balances — the expensive read, poke-only.
    includeSeatBalance
      ? fetchSeatBalancesForMembersTable({
          metronomeCustomerId: metronomeCustomerId ?? null,
          metronomeContractId,
          userIds: seatBalanceEligibleUserIds,
        })
      : Promise.resolve(new Map<string, number>()),
    // Free-seat per-user credit balance + granted total. Needed on every surface
    // (customer usage page included) to show the member's real allowance, so it
    // runs whenever the page has free seats — independent of `includeSeatBalance`.
    freeSeatUserIds.length > 0
      ? fetchFreeSeatCreditsForMembersTable({
          metronomeCustomerId: metronomeCustomerId ?? null,
        })
      : Promise.resolve({
          freeBalanceByUserId: new Map<string, number>(),
          freeStartingByUserId: new Map<string, number>(),
        }),
    fetchEffectivePerUserSpendLimits({
      metronomeCustomerId: metronomeCustomerId ?? null,
      workspaceId: workspace.sId,
      defaultPoolCapAwuCredits:
        creditUsageConfig?.defaultPoolCapAwuCredits ?? 0,
      includeAlertLinks,
    }),
    // Free-seat balance-alert ids (low + empty) for deep-linking — poke-only,
    // gated on `includeAlertLinks` so the customer page doesn't pay the extra
    // alert-list call.
    includeAlertLinks && metronomeCustomerId
      ? listPerUserCreditBalanceAlertsForWorkspace({
          metronomeCustomerId,
          workspaceId: workspace.sId,
        })
      : Promise.resolve(null),
    GroupResource.listGroupNamesByUserModelIdInWorkspace({
      auth,
      userModelIds: users.map((u) => u.id),
      groupKinds: [...CAP_ELIGIBLE_GROUP_KINDS],
    }),
    GroupResource.listMaxPoolCapGroupByUserModelIdInWorkspace({
      workspace,
      userModelIds: users.map((u) => u.id),
    }),
  ]);
  const freeCreditAlertIds =
    freeCreditAlertIdsByUserId?.isOk() === true
      ? freeCreditAlertIdsByUserId.value
      : null;
  const {
    perUserOverrideAlerts,
    defaultCapAwuCreditsBySeatType,
    defaultCapAlertsBySeatType,
    seatAllowanceBySeatType,
  } = perUserSpendLimits;

  const { memberships } = membershipsResult;

  const scheduledByUserId =
    await MembershipResource.getScheduledMembershipsByUserIdInWorkspace({
      workspace,
      userIds: memberships.map((m) => m.userId),
    });

  // With the rate-cap flag on, the per-user "near limit" (≥ 80% of the effective
  // cap) is derived from the Redis rate-limiter counter below; with it off, from
  // the Metronome near-limit flag. Matches the flag-aware enforcement in
  // `lib/api/credits/access_control.ts`.
  const featureFlags = await getFeatureFlags(auth);
  const spendCapEnabled = featureFlags.includes(
    "enforce_user_spend_limit_rate_cap"
  );

  // Bulk-fetch Metronome near-limit flags from Redis (poke-only). Still needed
  // when the rate-cap flag is on: free/none seats have no cycle cap for the
  // rate-limiter counter to model, so they fall back to this flag (driven by
  // their lifetime credit-balance alert).
  const nearLimitByUserId = includeAlertLinks
    ? new Map(
        await concurrentExecutor(
          users,
          async (u) =>
            [
              u.sId,
              await isUserAwuWarnedByMetronome(workspace.sId, u.sId),
            ] as const,
          { concurrency: 8 }
        )
      )
    : new Map<string, boolean>();

  // Bulk-fetch the Redis fixed-window spend-cap counter per user (poke-only), to
  // display beside the Elasticsearch-derived usage. The counter is bucketed on
  // the current contract billing cycle — resolve the window once, then read each
  // user's key. The same cycle also backs the per-member seat-usage pace below.
  const rateLimiterSpendByUserId = new Map<string, number>();
  let billingCycle: BillingCycle | null = null;
  if (includeAlertLinks) {
    const periodResult = await getCachedMetronomeCurrentBillingPeriod(
      workspace.sId
    );
    if (periodResult.isOk() && periodResult.value) {
      billingCycle = periodResult.value;
      const bounds = makeSpendLimitCycleWindowBounds(
        periodResult.value.cycleStart,
        periodResult.value.cycleEnd
      );
      const entries = await concurrentExecutor(
        users,
        async (u) => {
          const result = await getFixedWindowCount({
            key: makeSpendLimitAwuCreditsRateLimitKeyForUser(
              workspace,
              u.toJSON()
            ),
            bounds,
          });
          // The counter stores microCredits; convert back to credits so it
          // lines up with the ES/MT figures (all in credits).
          return [
            u.sId,
            result.isOk() ? microCreditsToCredits(result.value) : 0,
          ] as const;
        },
        { concurrency: 8 }
      );
      for (const [sId, value] of entries) {
        rateLimiterSpendByUserId.set(sId, value);
      }
    }
  }

  // Bulk-fetch each user's Metronome-side per-user AWU consumption (poke-only),
  // shown next to the ES and rate-limiter figures to spot divergence. Reuses the
  // resilient wrapper (empty map when Metronome isn't configured or on error).
  const metronomeConsumedByUserId = includeAlertLinks
    ? await fetchConsumedAwuCreditsFromMetronomeByUserId({
        workspaceId: workspace.sId,
        metronomeCustomerId: metronomeCustomerId ?? null,
        metronomeContractId,
        users: users.map((u) => ({
          sId: u.sId,
          seatType: membershipByUserId.get(u.id)?.seatType ?? null,
        })),
      })
    : new Map<string, number>();

  // Bulk-fetch each user's fair-use AWU credit usage (poke-only). This is a
  // bounded page (≤ 150) of Redis reads, so batch with `concurrentExecutor`.
  // Fair-use limits apply to non-credit-based plans (free/trial), so this is
  // resolved regardless of the workspace's credit-based status. Null when the
  // plan carries no fair-use limit.
  const fairUseByUserId = new Map<string, MemberFairUseUsage | null>();
  if (includeAlertLinks) {
    const plan = auth.plan();
    const entries = await concurrentExecutor(
      users,
      async (u) =>
        [
          u.sId,
          await getFairUseAwuCreditsStatus({
            workspace,
            user: u.toJSON(),
            plan,
          }),
        ] as const,
      { concurrency: 8 }
    );
    for (const [sId, status] of entries) {
      fairUseByUserId.set(
        sId,
        status.limit === -1
          ? null
          : {
              usedCredits: status.count,
              limitCredits: status.limit,
              timeframe: status.timeframe,
              windowDays:
                getTimeframeSecondsFromLiteral(status.timeframe) /
                (ONE_DAY_MS / 1000),
              nextResetAt: status.nextResetAt ?? null,
              refillSchedule: status.refillSchedule ?? [],
            }
      );
    }
  }

  const premiumMessageUsageByUserId = new Map<
    string,
    PremiumModelMessageUsage | null
  >();
  if (includeAlertLinks) {
    const plan = auth.plan();
    if (plan && !isCreditPricedPlan(plan)) {
      // Bounded to the current page size
      const entries = await concurrentExecutor(
        users,
        async (u) =>
          [
            u.sId,
            await getPremiumModelMessageUsage({
              workspace,
              user: u.toJSON(),
            }),
          ] as const,
        { concurrency: 8 }
      );
      for (const [sId, usage] of entries) {
        premiumMessageUsageByUserId.set(sId, usage);
      }
    }
  }

  const membersUsage: MemberUsageType[] = users.flatMap((u) => {
    const membership = membershipByUserId.get(u.id);
    if (!membership) {
      return [];
    }
    const userId = u.sId;
    // Free-seat users' seat balance and credit-balance alerts are keyed by the
    // prefixed Metronome user id; consumed credits come from the analytics
    // index, keyed by sId for everyone.
    const metronomeUserId =
      membership.seatType === "free" ? toFreeMetronomeUserId(userId) : userId;
    const totalConsumedCredits = perUserTotalConsumedCredits.get(userId) ?? 0;
    const seatData = seatDataByUserId.get(userId);
    const awuAllocation = seatData?.awuAllocation ?? 0;
    const scheduled = scheduledByUserId.get(membership.userId);

    // For free seats, the real allowance is the granted total of the member's
    // per-user free-seat credit (a Dust rep can raise it via the
    // `grant-user-free-credits` poke plugin), not the fixed seat-type constant.
    // Only available when seat balances were fetched (poke); elsewhere fall back
    // to the seat-type allocation.
    const freeStartingBalanceAwu =
      membership.seatType === "free"
        ? (freeStartingByUserId.get(userId) ?? null)
        : null;
    const effectiveAllocationAwu = freeStartingBalanceAwu ?? awuAllocation;

    // Credits drain seat-allowance-first, then the workspace pool, so the
    // allowance covers up to the user's seat allocation and the remainder
    // overflows to the pool.
    const consumedFromAllowanceAwuCredits = Math.min(
      totalConsumedCredits,
      effectiveAllocationAwu
    );
    const consumedFromPoolAwuCredits =
      totalConsumedCredits - consumedFromAllowanceAwuCredits;

    // Resolve the default cap for this member's seat type, and the user's
    // override if any. Both thresholds are derived from pool-only DB values
    // (membership override / workspace default) plus the seat allowance; the
    // Metronome alert ids are only resolved for deep links.
    const normalizedSeatType = normalizeToPoolLimitSeatType(
      membership.seatType
    );
    const defaultAwuCredits = normalizedSeatType
      ? (defaultCapAwuCreditsBySeatType[normalizedSeatType] ?? null)
      : null;
    // "none" seat users have no pool access, so their override is irrelevant.
    const overrideAwuCredits =
      membership.poolCapOverrideAwuCredits !== null &&
      membership.seatType !== "none"
        ? membership.poolCapOverrideAwuCredits +
          (normalizedSeatType
            ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
            : 0)
        : null;
    // Free seats have no pool, so their total spend cap is just the seat
    // allowance (allowance + 0 pool) — the cap includes the allowance like every
    // other seat, it just has no pool headroom on top. Use the member's real
    // free-credit total (which a rep may have raised) rather than the constant.
    // "none" seats have no seat and no pool access, so their cap is explicitly
    // 0 rather than falling through to an unlimited `null`.
    const effectiveDefaultAwuCredits =
      membership.seatType === "free"
        ? effectiveAllocationAwu
        : membership.seatType === "none"
          ? 0
          : defaultAwuCredits;

    // Max group cap (pool-only, stored on the group) + seat allowance, to match
    // the units of override/default above. Only pool-bearing seats
    // (pro/max/workspace) get a group cap; free/none have no pool.
    const maxPoolCapGroup = groupCapByUserModelId.get(u.id);
    const groupPoolCapAwuCredits = maxPoolCapGroup?.capAwuCredits ?? null;
    const groupCapAwuCredits =
      groupPoolCapAwuCredits !== null && normalizedSeatType !== null
        ? groupPoolCapAwuCredits +
          (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
        : null;

    const spendLimitSource = resolveEffectiveSpendLimitSource({
      overrideAwuCredits,
      groupCapAwuCredits,
      defaultAwuCredits: effectiveDefaultAwuCredits,
    });
    const effectiveSpendLimitAwuCredits = resolveEffectiveSpendLimitAwuCredits({
      overrideAwuCredits,
      groupCapAwuCredits,
      defaultAwuCredits: effectiveDefaultAwuCredits,
    });
    const effectiveCapAlert =
      spendLimitSource === "override"
        ? (perUserOverrideAlerts.get(userId) ?? null)
        : spendLimitSource === "default" && normalizedSeatType
          ? (defaultCapAlertsBySeatType[normalizedSeatType] ?? null)
          : null;
    const spendLimitAlertId = includeAlertLinks
      ? (effectiveCapAlert?.alertId ?? null)
      : null;
    const spendLimitWarningAlertId = includeAlertLinks
      ? (effectiveCapAlert?.warningAlertId ?? null)
      : null;

    // Free-seat balance-alert deep links (poke-only). Only free seats have
    // these per-user credit-balance alerts. Alerts are keyed by the
    // free-prefixed Metronome user id.
    const freeCreditAlerts =
      membership.seatType === "free"
        ? (freeCreditAlertIds?.get(metronomeUserId) ?? null)
        : null;

    const rateLimiterSpendAwuCredits = includeAlertLinks
      ? (rateLimiterSpendByUserId.get(userId) ?? 0)
      : null;
    // Poke-only near-limit. With the rate-cap flag on, use the rate-limiter
    // counter ≥ 80% of the effective cap — but only for seats that actually
    // have a cycle cap. Free/none seats (no effective cap) have no counter to
    // model their lifetime balance, so they fall back to the Metronome
    // near-limit flag, same as when the flag is off.
    const hasCycleCap =
      effectiveSpendLimitAwuCredits !== null &&
      effectiveSpendLimitAwuCredits > 0;
    const nearLimit =
      includeAlertLinks &&
      (spendCapEnabled && hasCycleCap
        ? (rateLimiterSpendAwuCredits ?? 0) >=
          USER_AWU_WARNING_PERCENTAGE * effectiveSpendLimitAwuCredits
        : (nearLimitByUserId.get(userId) ?? false));

    // Seat-allowance consumption used for pace classification below: free
    // seats track their live Metronome balance instead of the period spend
    // (same distinction the seat-usage ring draws client-side). A missing
    // entry means the balance read failed (the fetcher degrades to an empty
    // map on Metronome failure), not that the balance is zero, so it must
    // stay unknown rather than be treated as fully consumed.
    const freeBalanceAwu = freeBalanceByUserId.get(userId) ?? null;
    const seatAllowanceAwu =
      effectiveAllocationAwu > 0 ? effectiveAllocationAwu : null;
    const seatConsumedAwu =
      membership.seatType === "free"
        ? seatAllowanceAwu !== null && freeBalanceAwu !== null
          ? Math.max(0, seatAllowanceAwu - freeBalanceAwu)
          : null
        : consumedFromAllowanceAwuCredits;
    // Free seats have a lifetime, non-renewing grant, not a recurring
    // billing-cycle allowance, so the billing-cycle pace classification
    // (on-track/orange/critical) doesn't apply to them.
    const seatUsageTarget =
      billingCycle &&
      membership.seatType !== "free" &&
      seatAllowanceAwu !== null &&
      seatConsumedAwu !== null
        ? (computeCreditUsageStatus({
            consumedAwuCredits: seatConsumedAwu,
            limitAwuCredits: seatAllowanceAwu,
            billingCycle,
            nowMs: Date.now(),
          })?.target ?? null)
        : null;
    const overallUsageTarget =
      billingCycle && effectiveSpendLimitAwuCredits !== null
        ? (computeCreditUsageStatus({
            consumedAwuCredits: totalConsumedCredits,
            limitAwuCredits: effectiveSpendLimitAwuCredits,
            billingCycle,
            nowMs: Date.now(),
          })?.target ?? null)
        : null;

    return [
      {
        sId: userId,
        // Prefer the first/last name; fall back to the `name` column (which can
        // be the email for users provisioned without a display name).
        name: u.fullName() || u.name,
        email: u.email ?? null,
        image: u.imageUrl ?? null,
        groups: groupNamesByUserModelId.get(u.id) ?? [],
        seatType: membership.seatType ?? null,
        memberUsageLimit:
          effectiveAllocationAwu > 0 ? effectiveAllocationAwu : null,
        seatBalanceAwu:
          membership.seatType === "free"
            ? freeBalanceAwu
            : effectiveAllocationAwu > 0
              ? (seatBalanceByUserId.get(userId) ?? null)
              : null,
        consumedAwuCredits: totalConsumedCredits,
        consumedFromAllowanceAwuCredits,
        consumedFromPoolAwuCredits,
        billingFrequency:
          seatData?.billingFrequency ??
          deriveWorkspaceSeatBillingFrequency(membership.seatType ?? null),
        nextCreditResetAt: seatData?.nextCreditResetAt ?? null,
        scheduledSeatType: scheduled?.seatType ?? null,
        scheduledSeatChangeAt: scheduled?.startAt.toISOString() ?? null,
        spendLimitAwuCredits: effectiveSpendLimitAwuCredits,
        rateLimiterSpendAwuCredits,
        metronomeConsumedAwuCredits: includeAlertLinks
          ? (metronomeConsumedByUserId.get(userId) ?? 0)
          : null,
        spendLimitSource,
        spendLimitGroupName:
          spendLimitSource === "group"
            ? (maxPoolCapGroup?.groupName ?? null)
            : null,
        spendLimitAlertId,
        spendLimitWarningAlertId,
        freeCreditLowAlert: freeCreditAlerts?.low ?? null,
        freeCreditEmptyAlert: freeCreditAlerts?.empty ?? null,
        creditState: membership.creditState,
        nearLimit,
        fairUse: fairUseByUserId.get(userId) ?? null,
        premiumMessageUsage: premiumMessageUsageByUserId.get(userId) ?? null,
        seatUsageTarget,
        overallUsageTarget,
      },
    ];
  });

  return {
    members: membersUsage,
    total,
    creditsResetAt,
  };
}
