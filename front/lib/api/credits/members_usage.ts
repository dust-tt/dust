import type { Authenticator } from "@app/lib/auth";
import { listPerUserCreditBalanceAlertsForWorkspace } from "@app/lib/metronome/alerts/per_user_credit_balance";
import type {
  MetronomeCapAlertIds,
  MetronomeCapAlertInfo,
} from "@app/lib/metronome/alerts/spend_limits";
import {
  getCachedDefaultCapThresholdsBySeatType,
  getCachedPerUserCapAlertIds,
  getMetronomeDefaultUserCapAlertForSeatType,
  getMetronomeDefaultUserWarningAlertForSeatType,
  listMetronomePerUserCapsForWorkspace,
  listMetronomePerUserWarningAlertsForWorkspace,
} from "@app/lib/metronome/alerts/spend_limits";
import type { MetronomeAlertRef } from "@app/lib/metronome/alerts/types";
import {
  listCustomerPerUserCreditBalances,
  listMetronomeSeatBalances,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  FREE_SEAT_LIFETIME_AWU_CREDITS,
  getCreditTypeAwuId,
  toFreeMetronomeUserId,
} from "@app/lib/metronome/constants";
import {
  fetchPerUserAwuUsage,
  getPerUserAwuUsage,
} from "@app/lib/metronome/per_user_usage";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import {
  buildSeatDataByUserId,
  getCachedSeatDataByUserId,
  type SeatData,
} from "@app/lib/metronome/seats";
import type { BillingFrequency } from "@app/lib/metronome/types";
import { isUserAwuWarned } from "@app/lib/metronome/user_block";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { EffectiveSpendLimitSource } from "@app/lib/spend_limits/effective";
import {
  resolveEffectiveSpendLimitAwuCredits,
  resolveEffectiveSpendLimitSource,
} from "@app/lib/spend_limits/effective";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  MembershipSeatType,
  NormalizedPoolLimitSeatType,
  UserCreditState,
} from "@app/types/memberships";
import {
  MEMBERSHIP_SEAT_TYPES,
  NORMALIZED_POOL_LIMIT_SEAT_TYPES,
  normalizeToPoolLimitSeatType,
  toBaseSeatType,
} from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import { z } from "zod";

export type MemberUsageType = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
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
  // Where `spendLimitAwuCredits` comes from: a user-specific `override`, the
  // seat-type `default`, or `none` (no cap configured / unlimited).
  spendLimitSource: EffectiveSpendLimitSource;
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
  // Whether the user has consumed ≥ 80% of their effective limit. Driven by
  // the nearLimit Redis flag (see user_block.ts). Poke-only.
  nearLimit: boolean;
};

export type GetMembersUsageResponseBody = {
  members: MemberUsageType[];
  total: number;
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

export const DEFAULT_MEMBERS_USAGE_PAGE_LIMIT = 50;
export const MAX_MEMBERS_USAGE_PAGE_LIMIT = 150;

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
  // for pagination instead of relevance ranking.
  orderColumn: z.enum(["name", "email"]).catch("name"),
  orderDirection: z.enum(["asc", "desc"]).catch("asc"),
  // Optional seat-type filter. A base seat type (e.g. "pro") matches its
  // monthly and yearly variants; "none" matches members with no seat.
  seatType: z.enum(MEMBERSHIP_SEAT_TYPES).optional().catch(undefined),
});

export type MembersUsagePaginationInput = z.infer<
  typeof MembersUsagePaginationSchema
>;

async function fetchPerUserUsageCreditsForMembersTableUncached({
  metronomeCustomerId,
  metronomeContractId,
  userIds,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  userIds: string[];
}): Promise<Map<string, number>> {
  const result = await fetchPerUserAwuUsage({
    metronomeCustomerId,
    metronomeContractId,
    userIds,
  });
  if (result.isErr()) {
    logger.warn(
      { err: result.error, metronomeCustomerId },
      "[MembersUsage] Failed to fetch per-user usage"
    );
    return new Map();
  }
  return result.value;
}

async function fetchPerUserUsageCreditsForMembersTable({
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
  try {
    return await getPerUserAwuUsage({
      metronomeCustomerId,
      metronomeContractId,
      userIds,
    });
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), metronomeCustomerId },
      "[MembersUsage] Failed to read cached per-user usage, falling back to uncached fetch"
    );
    return fetchPerUserUsageCreditsForMembersTableUncached({
      metronomeCustomerId,
      metronomeContractId,
      userIds,
    });
  }
}

async function fetchSeatDataForMembersTableUncached({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Map<string, SeatData>> {
  const seatDataResult = await buildSeatDataByUserId({
    metronomeCustomerId,
    contractId: metronomeContractId,
  });
  if (seatDataResult.isErr()) {
    logger.warn(
      { err: seatDataResult.error, metronomeCustomerId },
      "[MembersUsage] Failed to build seat data, degrading to empty map"
    );
    return new Map();
  }
  return seatDataResult.value;
}

async function fetchSeatDataForMembersTable({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
}): Promise<Map<string, SeatData>> {
  if (!metronomeCustomerId || !metronomeContractId) {
    return new Map();
  }
  try {
    return new Map(
      Object.entries(
        await getCachedSeatDataByUserId({
          metronomeCustomerId,
          contractId: metronomeContractId,
        })
      )
    );
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), metronomeCustomerId },
      "[MembersUsage] Failed to read cached seat data, falling back to uncached fetch"
    );
    return fetchSeatDataForMembersTableUncached({
      metronomeCustomerId,
      metronomeContractId,
    });
  }
}

// Live per-seat AWU balance remaining, keyed by userId. Degrades to an empty
// map on any read failure so the members table still renders (the column just
// shows "-"). Mirrors how the seat-balance alerts read the same source.
async function fetchSeatBalancesForMembersTable({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
}): Promise<Map<string, number>> {
  if (!metronomeCustomerId || !metronomeContractId) {
    return new Map();
  }
  const result = await listMetronomeSeatBalances({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (result.isErr()) {
    logger.warn(
      { err: result.error, metronomeCustomerId },
      "[MembersUsage] Failed to fetch seat balances, degrading to empty map"
    );
    return new Map();
  }
  const awuCreditTypeId = getCreditTypeAwuId();
  const balanceByUserId = new Map<string, number>();
  for (const seat of result.value) {
    const awu = seat.balances.find((b) => b.credit_type_id === awuCreditTypeId);
    if (awu) {
      balanceByUserId.set(seat.seat_id, awu.balance);
    }
  }

  // Free seats hold a per-user contract credit rather than a seat balance, so
  // they're absent from `listMetronomeSeatBalances`. Fill their remaining
  // balance in from the per-user credits — but only when the user has no seat
  // balance: a user who switched free → pro/max still has a leftover free
  // credit, and it must not overwrite their (real) pro/max seat balance.
  // Degrades silently on read failure.
  const perUserCreditBalances = await listCustomerPerUserCreditBalances({
    metronomeCustomerId,
    contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
  });
  if (perUserCreditBalances.isOk()) {
    for (const [userId, { balanceAwu }] of perUserCreditBalances.value) {
      if (!balanceByUserId.has(userId)) {
        balanceByUserId.set(userId, balanceAwu);
      }
    }
  } else {
    logger.warn(
      { err: perUserCreditBalances.error, metronomeCustomerId },
      "[MembersUsage] Failed to fetch per-user credit balances, skipping"
    );
  }

  return balanceByUserId;
}

async function fetchPerUserCapAlertIdsUncached({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Map<string, MetronomeCapAlertIds>> {
  const [capsResult, warningsResult] = await Promise.all([
    listMetronomePerUserCapsForWorkspace({ metronomeCustomerId, workspaceId }),
    listMetronomePerUserWarningAlertsForWorkspace({
      metronomeCustomerId,
      workspaceId,
    }),
  ]);
  if (capsResult.isErr()) {
    logger.warn(
      { err: capsResult.error, workspaceId },
      "[MembersUsage] Failed to fetch per-user spend cap alerts"
    );
    return new Map();
  }
  const warnings = warningsResult.isErr() ? new Map() : warningsResult.value;

  const caps = new Map<string, MetronomeCapAlertIds>();
  for (const [userId, entry] of capsResult.value) {
    caps.set(userId, {
      alertId: entry.alert.id,
      warningAlertId: warnings.get(userId)?.alert.id ?? null,
    });
  }

  return caps;
}

async function fetchDefaultCapsBySeatTypeUncached({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<
  Partial<Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>>
> {
  const caps: Partial<
    Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>
  > = {};
  for (const seatType of NORMALIZED_POOL_LIMIT_SEAT_TYPES) {
    const [capResult, warningResult] = await Promise.all([
      getMetronomeDefaultUserCapAlertForSeatType({
        metronomeCustomerId,
        workspaceId,
        seatType,
      }),
      getMetronomeDefaultUserWarningAlertForSeatType({
        metronomeCustomerId,
        workspaceId,
        seatType,
      }),
    ]);
    if (capResult.isErr()) {
      logger.warn(
        { err: capResult.error, workspaceId, seatType },
        "[MembersUsage] Failed to fetch default spend cap for seat type"
      );
      continue;
    }
    if (capResult.value) {
      caps[seatType] = {
        threshold: capResult.value.alert.threshold,
        alertId: capResult.value.alert.id,
        warningAlertId: warningResult.isOk()
          ? (warningResult.value?.alert.id ?? null)
          : null,
      };
    }
  }
  return caps;
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
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to read cached per-user spend cap alert ids, falling back to uncached fetch"
    );
    return fetchPerUserCapAlertIdsUncached({
      metronomeCustomerId,
      workspaceId,
    });
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
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to read cached default spend caps by seat type, falling back to uncached fetch"
    );
    return fetchDefaultCapsBySeatTypeUncached({
      metronomeCustomerId,
      workspaceId,
    });
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
  defaultPoolCapAwuCredits,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  userId: string;
  seatType: MembershipSeatType | null | undefined;
  poolCapOverrideAwuCredits: number | null;
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
  const overrideAwuCredits =
    poolCapOverrideAwuCredits !== null
      ? poolCapOverrideAwuCredits +
        (normalizedSeatType
          ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
          : 0)
      : null;

  const spendLimitAwuCredits = resolveEffectiveSpendLimitAwuCredits({
    overrideAwuCredits,
    defaultAwuCredits,
  });

  if (spendLimitAwuCredits === null) {
    return null;
  }

  const consumed = perUserTotalConsumedCredits.get(metronomeUserId) ?? 0;
  return Math.max(0, (spendLimitAwuCredits - consumed) / spendLimitAwuCredits);
}

export type GetMemberUsageResponseBody = {
  member: MemberUsageType | null;
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

  // The workspace-wide default pool cap lives on the credit-usage
  // configuration row (created lazily; absent → no default configured).
  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  const [
    membershipsResult,
    perUserTotalConsumedCredits,
    seatDataByUserId,
    perUserSpendLimits,
  ] = await Promise.all([
    MembershipResource.getActiveMemberships({
      workspace,
      users: [userResource],
    }),
    fetchPerUserUsageCreditsForMembersTable({
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
  ]);

  const { defaultCapAwuCreditsBySeatType, seatAllowanceBySeatType } =
    perUserSpendLimits;
  const { memberships } = membershipsResult;
  const membership = memberships.find((m) => m.userId === userResource.id);

  if (!membership) {
    return { member: null };
  }

  const metronomeUserId =
    membership.seatType === "free" ? toFreeMetronomeUserId(userId) : userId;
  const totalConsumedCredits =
    perUserTotalConsumedCredits.get(metronomeUserId) ?? 0;
  const seatData = seatDataByUserId.get(userId);
  const awuAllocation = seatData?.awuAllocation ?? 0;

  const consumedFromAllowanceAwuCredits = Math.min(
    totalConsumedCredits,
    awuAllocation
  );
  const consumedFromPoolAwuCredits =
    totalConsumedCredits - consumedFromAllowanceAwuCredits;

  const normalizedSeatType = normalizeToPoolLimitSeatType(membership.seatType);
  const defaultAwuCredits = normalizedSeatType
    ? (defaultCapAwuCreditsBySeatType[normalizedSeatType] ?? null)
    : null;
  const overrideAwuCredits =
    membership.poolCapOverrideAwuCredits !== null
      ? membership.poolCapOverrideAwuCredits +
        (normalizedSeatType
          ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
          : 0)
      : null;
  // Free seats have no pool, so their total spend cap is just the seat
  // allowance (allowance + 0 pool) — like every other seat the cap includes the
  // allowance, it just has no pool headroom on top. There's no default cap alert
  // for free (normalizeToPoolLimitSeatType is null), so we supply it explicitly.
  const effectiveDefaultAwuCredits =
    membership.seatType === "free"
      ? FREE_SEAT_LIFETIME_AWU_CREDITS
      : defaultAwuCredits;

  const spendLimitSource = resolveEffectiveSpendLimitSource({
    overrideAwuCredits,
    defaultAwuCredits: effectiveDefaultAwuCredits,
  });

  return {
    member: {
      sId: userId,
      name: userResource.fullName() || userResource.name,
      email: userResource.email ?? null,
      image: userResource.imageUrl ?? null,
      seatType: membership.seatType ?? null,
      memberUsageLimit: awuAllocation > 0 ? awuAllocation : null,
      seatBalanceAwu: null,
      consumedAwuCredits: totalConsumedCredits,
      consumedFromAllowanceAwuCredits,
      consumedFromPoolAwuCredits,
      billingFrequency:
        seatData?.billingFrequency ??
        deriveWorkspaceSeatBillingFrequency(membership.seatType ?? null),
      nextCreditResetAt: seatData?.nextCreditResetAt ?? null,
      scheduledSeatType: null,
      scheduledSeatChangeAt: null,
      spendLimitAwuCredits: resolveEffectiveSpendLimitAwuCredits({
        overrideAwuCredits,
        defaultAwuCredits: effectiveDefaultAwuCredits,
      }),
      spendLimitSource,
      spendLimitAlertId: null,
      spendLimitWarningAlertId: null,
      freeCreditLowAlert: null,
      freeCreditEmptyAlert: null,
      creditState: membership.creditState,
      nearLimit: false,
    },
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

  // When a seat-type filter is active, resolve the matching user sIds up front
  // and restrict the search to them so pagination and the returned `total`
  // reflect the filtered set. No match means an empty page.
  let restrictToUserIds: string[] | undefined;
  if (paginationParams.seatType) {
    restrictToUserIds = await resolveSeatTypeFilterUserIds({
      workspace,
      seatType: paginationParams.seatType,
    });
    if (restrictToUserIds.length === 0) {
      return { members: [], total: 0 };
    }
  }

  const usersResult = await UserResource.searchUsers(auth, {
    searchTerm: paginationParams.search ?? "",
    offset: paginationParams.offset,
    limit: paginationParams.limit,
    orderBy: {
      field: paginationParams.orderColumn,
      direction: paginationParams.orderDirection,
    },
    restrictToUserIds,
  });

  if (usersResult.isErr()) {
    return { members: [], total: 0 };
  }

  const { users, total } = usersResult.value;

  if (users.length === 0) {
    return { members: [], total };
  }

  // The workspace-wide default pool cap lives on the credit-usage
  // configuration row (created lazily; absent → no default configured).
  const creditUsageConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  // Fetch membership details and Metronome data in parallel for the
  // current page of users.
  const [
    membershipsResult,
    perUserTotalConsumedCredits,
    seatDataByUserId,
    seatBalanceByUserId,
    perUserSpendLimits,
    freeCreditAlertIdsByUserId,
  ] = await Promise.all([
    MembershipResource.getActiveMemberships({ workspace, users }),
    fetchPerUserUsageCreditsForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
      // Include both the raw sId and the free-prefixed form: free-seat users'
      // usage is keyed by the prefixed id in Metronome, regular users by sId.
      userIds: users.flatMap((u) => [u.sId, toFreeMetronomeUserId(u.sId)]),
    }),
    fetchSeatDataForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    includeSeatBalance
      ? fetchSeatBalancesForMembersTable({
          metronomeCustomerId: metronomeCustomerId ?? null,
          metronomeContractId,
        })
      : Promise.resolve(new Map<string, number>()),
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

  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));

  // Bulk-fetch near-limit flags from Redis (poke-only, gated on includeAlertLinks).
  const nearLimitByUserId = includeAlertLinks
    ? new Map(
        await concurrentExecutor(
          users,
          async (u) =>
            [u.sId, await isUserAwuWarned(workspace.sId, u.sId)] as const,
          { concurrency: 8 }
        )
      )
    : new Map<string, boolean>();

  const membersUsage: MemberUsageType[] = users.flatMap((u) => {
    const membership = membershipByUserId.get(u.id);
    if (!membership) {
      return [];
    }
    const userId = u.sId;
    // Free-seat users' usage is stored under the prefixed Metronome user id.
    const metronomeUserId =
      membership.seatType === "free" ? toFreeMetronomeUserId(userId) : userId;
    const totalConsumedCredits =
      perUserTotalConsumedCredits.get(metronomeUserId) ?? 0;
    const seatData = seatDataByUserId.get(userId);
    const awuAllocation = seatData?.awuAllocation ?? 0;
    const scheduled = scheduledByUserId.get(membership.userId);

    // Credits drain seat-allowance-first, then the workspace pool, so the
    // allowance covers up to the user's seat allocation and the remainder
    // overflows to the pool.
    const consumedFromAllowanceAwuCredits = Math.min(
      totalConsumedCredits,
      awuAllocation
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
    const overrideAwuCredits =
      membership.poolCapOverrideAwuCredits !== null
        ? membership.poolCapOverrideAwuCredits +
          (normalizedSeatType
            ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
            : 0)
        : null;
    // Free seats have no pool, so their total spend cap is just the seat
    // allowance (allowance + 0 pool) — the cap includes the allowance like every
    // other seat, it just has no pool headroom on top.
    const effectiveDefaultAwuCredits =
      membership.seatType === "free"
        ? FREE_SEAT_LIFETIME_AWU_CREDITS
        : defaultAwuCredits;

    const spendLimitSource = resolveEffectiveSpendLimitSource({
      overrideAwuCredits,
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

    return [
      {
        sId: userId,
        // Prefer the first/last name; fall back to the `name` column (which can
        // be the email for users provisioned without a display name).
        name: u.fullName() || u.name,
        email: u.email ?? null,
        image: u.imageUrl ?? null,
        seatType: membership.seatType ?? null,
        memberUsageLimit: awuAllocation > 0 ? awuAllocation : null,
        seatBalanceAwu:
          awuAllocation > 0
            ? (seatBalanceByUserId.get(metronomeUserId) ?? null)
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
        spendLimitAwuCredits: resolveEffectiveSpendLimitAwuCredits({
          overrideAwuCredits,
          defaultAwuCredits: effectiveDefaultAwuCredits,
        }),
        spendLimitSource,
        spendLimitAlertId,
        spendLimitWarningAlertId,
        freeCreditLowAlert: freeCreditAlerts?.low ?? null,
        freeCreditEmptyAlert: freeCreditAlerts?.empty ?? null,
        creditState: membership.creditState,
        nearLimit: nearLimitByUserId.get(userId) ?? false,
      },
    ];
  });

  return {
    members: membersUsage,
    total,
  };
}
