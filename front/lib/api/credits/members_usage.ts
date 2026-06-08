import type { Authenticator } from "@app/lib/auth";
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
import { listMetronomeSeatBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
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
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { EffectiveSpendLimitSource } from "@app/lib/spend_limits/effective";
import {
  resolveEffectiveSpendLimitAwuCredits,
  resolveEffectiveSpendLimitSource,
} from "@app/lib/spend_limits/effective";
import logger from "@app/logger/logger";
import type {
  MembershipSeatType,
  NormalizedPoolLimitSeatType,
  UserCreditState,
} from "@app/types/memberships";
import {
  NORMALIZED_POOL_LIMIT_SEAT_TYPES,
  normalizeToPoolLimitSeatType,
} from "@app/types/memberships";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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
  // Per-user credit state machine state (personal-credits → pool → capped
  // progression) persisted on the membership. Surfaced for debugging.
  creditState: UserCreditState;
};

export type GetMembersUsageResponseBody = {
  members: MemberUsageType[];
  total: number;
};

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
 *   - the per-seat-type default cap thresholds (Metronome alerts)
 *   - the per-seat-type seat allowances, used to derive the total threshold
 *     from the pool-only override persisted on each membership
 *   - the per-user override alerts, fetched from Metronome only when alert
 *     deep links are requested (the override *threshold* comes from the DB)
 */
async function fetchEffectivePerUserSpendLimits({
  metronomeCustomerId,
  workspaceId,
  includeAlertLinks,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  includeAlertLinks: boolean;
}): Promise<{
  perUserOverrideAlerts: Map<string, MetronomeCapAlertIds>;
  defaultAwuCreditsBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>
  >;
  seatAllowanceBySeatType: Partial<Record<NormalizedPoolLimitSeatType, number>>;
}> {
  if (!metronomeCustomerId) {
    return {
      perUserOverrideAlerts: new Map(),
      defaultAwuCreditsBySeatType: {},
      seatAllowanceBySeatType: {},
    };
  }

  const [perUserOverrideAlerts, defaultAwuCreditsBySeatType] =
    await Promise.all([
      includeAlertLinks
        ? fetchPerUserCapAlertIds({ metronomeCustomerId, workspaceId })
        : Promise.resolve(new Map<string, MetronomeCapAlertIds>()),
      fetchDefaultCapsBySeatType({ metronomeCustomerId, workspaceId }),
    ]);

  let seatAllowanceBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, number>
  > = {};
  try {
    seatAllowanceBySeatType =
      await getSeatAllowancesByNormalizedSeatType(workspaceId);
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to resolve seat allowances, degrading to pool-only override thresholds"
    );
  }

  return {
    perUserOverrideAlerts,
    defaultAwuCreditsBySeatType,
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
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
  userId: string;
  seatType: MembershipSeatType | null | undefined;
  poolCapOverrideAwuCredits: number | null;
}): Promise<number | null> {
  const contract = metronomeCustomerId
    ? await getActiveContract(workspaceId)
    : null;
  const metronomeContractId = contract?.id ?? null;

  const [
    perUserTotalConsumedCredits,
    { defaultAwuCreditsBySeatType, seatAllowanceBySeatType },
  ] = await Promise.all([
    fetchPerUserUsageCreditsForMembersTable({
      metronomeCustomerId,
      metronomeContractId,
      userIds: [userId],
    }),
    fetchEffectivePerUserSpendLimits({
      metronomeCustomerId,
      workspaceId,
      includeAlertLinks: false,
    }),
  ]);

  const normalizedSeatType = normalizeToPoolLimitSeatType(seatType);
  const defaultCap = normalizedSeatType
    ? (defaultAwuCreditsBySeatType[normalizedSeatType] ?? null)
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
    defaultAwuCredits: defaultCap?.threshold ?? null,
  });

  if (!spendLimitAwuCredits) {
    return null;
  }

  const consumed = perUserTotalConsumedCredits.get(userId) ?? 0;
  return Math.max(0, (spendLimitAwuCredits - consumed) / spendLimitAwuCredits);
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

  const usersResult = await UserResource.searchUsers(auth, {
    searchTerm: paginationParams.search ?? "",
    offset: paginationParams.offset,
    limit: paginationParams.limit,
    orderBy: {
      field: paginationParams.orderColumn,
      direction: paginationParams.orderDirection,
    },
  });

  if (usersResult.isErr()) {
    return { members: [], total: 0 };
  }

  const { users, total } = usersResult.value;

  if (users.length === 0) {
    return { members: [], total };
  }

  // Fetch membership details and Metronome data in parallel for the
  // current page of users.
  const [
    membershipsResult,
    perUserTotalConsumedCredits,
    seatDataByUserId,
    seatBalanceByUserId,
    perUserSpendLimits,
  ] = await Promise.all([
    MembershipResource.getActiveMemberships({ workspace, users }),
    fetchPerUserUsageCreditsForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
      userIds: users.map((u) => u.sId),
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
      includeAlertLinks,
    }),
  ]);
  const {
    perUserOverrideAlerts,
    defaultAwuCreditsBySeatType,
    seatAllowanceBySeatType,
  } = perUserSpendLimits;

  const { memberships } = membershipsResult;

  const scheduledByUserId =
    await MembershipResource.getScheduledMembershipsByUserIdInWorkspace({
      workspace,
      userIds: memberships.map((m) => m.userId),
    });

  const membershipByUserId = new Map(memberships.map((m) => [m.userId, m]));
  const membersUsage: MemberUsageType[] = users.flatMap((u) => {
    const membership = membershipByUserId.get(u.id);
    if (!membership) {
      return [];
    }
    const userId = u.sId;
    const totalConsumedCredits = perUserTotalConsumedCredits.get(userId) ?? 0;
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
    // override if any. The override threshold is derived from the pool-only
    // value persisted on the membership plus the seat allowance; the
    // Metronome alert ids are only resolved for deep links.
    const normalizedSeatType = normalizeToPoolLimitSeatType(
      membership.seatType
    );
    const defaultCap = normalizedSeatType
      ? (defaultAwuCreditsBySeatType[normalizedSeatType] ?? null)
      : null;
    const overrideAwuCredits =
      membership.poolCapOverrideAwuCredits !== null
        ? membership.poolCapOverrideAwuCredits +
          (normalizedSeatType
            ? (seatAllowanceBySeatType[normalizedSeatType] ?? 0)
            : 0)
        : null;

    const spendLimitSource = resolveEffectiveSpendLimitSource({
      overrideAwuCredits,
      defaultAwuCredits: defaultCap?.threshold ?? null,
    });
    const effectiveCapAlert =
      spendLimitSource === "override"
        ? (perUserOverrideAlerts.get(userId) ?? null)
        : spendLimitSource === "default"
          ? defaultCap
          : null;
    const spendLimitAlertId = includeAlertLinks
      ? (effectiveCapAlert?.alertId ?? null)
      : null;
    const spendLimitWarningAlertId = includeAlertLinks
      ? (effectiveCapAlert?.warningAlertId ?? null)
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
          awuAllocation > 0 ? (seatBalanceByUserId.get(userId) ?? null) : null,
        consumedAwuCredits: totalConsumedCredits,
        consumedFromAllowanceAwuCredits,
        consumedFromPoolAwuCredits,
        billingFrequency: seatData?.billingFrequency ?? null,
        scheduledSeatType: scheduled?.seatType ?? null,
        scheduledSeatChangeAt: scheduled?.startAt.toISOString() ?? null,
        spendLimitAwuCredits: resolveEffectiveSpendLimitAwuCredits({
          overrideAwuCredits,
          defaultAwuCredits: defaultCap?.threshold ?? null,
        }),
        spendLimitSource,
        spendLimitAlertId,
        spendLimitWarningAlertId,
        creditState: membership.creditState,
      },
    ];
  });

  return {
    members: membersUsage,
    total,
  };
}
