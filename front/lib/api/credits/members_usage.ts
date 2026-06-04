import type { Authenticator } from "@app/lib/auth";
import type { MetronomeCapAlertInfo } from "@app/lib/metronome/alerts/spend_limits";
import {
  getCachedDefaultCapThresholdsBySeatType,
  getCachedPerUserCapThresholds,
  getMetronomeDefaultUserCapAlertForSeatType,
  getMetronomeDefaultUserWarningAlertForSeatType,
  listMetronomePerUserCapsForWorkspace,
  listMetronomePerUserWarningAlertsForWorkspace,
} from "@app/lib/metronome/alerts/spend_limits";
import {
  fetchPerUserAwuUsage,
  getCachedPerUserAwuUsage,
} from "@app/lib/metronome/per_user_usage";
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
});

export type MembersUsagePaginationInput = z.infer<
  typeof MembersUsagePaginationSchema
>;

async function fetchPerUserUsageCreditsForMembersTableUncached({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
}): Promise<Map<string, number>> {
  const result = await fetchPerUserAwuUsage({
    metronomeCustomerId,
    metronomeContractId,
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
}: {
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
}): Promise<Map<string, number>> {
  if (!metronomeCustomerId || !metronomeContractId) {
    return new Map();
  }
  try {
    return new Map(
      Object.entries(
        await getCachedPerUserAwuUsage({
          metronomeCustomerId,
          metronomeContractId,
        })
      )
    );
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), metronomeCustomerId },
      "[MembersUsage] Failed to read cached per-user usage, falling back to uncached fetch"
    );
    return fetchPerUserUsageCreditsForMembersTableUncached({
      metronomeCustomerId,
      metronomeContractId,
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

async function fetchPerUserCapOverridesUncached({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Map<string, MetronomeCapAlertInfo>> {
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
      "[MembersUsage] Failed to fetch per-user spend caps"
    );
    return new Map();
  }
  const warnings = warningsResult.isErr() ? new Map() : warningsResult.value;

  const caps = new Map<string, MetronomeCapAlertInfo>();
  for (const [userId, entry] of capsResult.value) {
    caps.set(userId, {
      threshold: entry.alert.threshold,
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
 * Resolve the effective per-user spend limit for the members table:
 *   - if the user has a per-user override, the override threshold wins
 *   - otherwise, the workspace default for the user's seat type applies
 *   - otherwise, the user is uncapped (`null`)
 *
 * Returns per-user overrides and per-seat-type default thresholds.
 */
async function fetchEffectivePerUserSpendLimits({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
}): Promise<{
  perUserOverrides: Map<string, MetronomeCapAlertInfo>;
  defaultAwuCreditsBySeatType: Partial<
    Record<NormalizedPoolLimitSeatType, MetronomeCapAlertInfo>
  >;
}> {
  if (!metronomeCustomerId) {
    return { perUserOverrides: new Map(), defaultAwuCreditsBySeatType: {} };
  }

  const [perUserOverrides, defaultAwuCreditsBySeatType] = await Promise.all([
    fetchPerUserCapOverrides({ metronomeCustomerId, workspaceId }),
    fetchDefaultCapsBySeatType({ metronomeCustomerId, workspaceId }),
  ]);

  return { perUserOverrides, defaultAwuCreditsBySeatType };
}

async function fetchPerUserCapOverrides({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Map<string, MetronomeCapAlertInfo>> {
  try {
    return new Map(
      Object.entries(
        await getCachedPerUserCapThresholds({
          metronomeCustomerId,
          workspaceId,
        })
      )
    );
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to read cached per-user spend caps, falling back to uncached fetch"
    );
    return fetchPerUserCapOverridesUncached({
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

export async function getMembersUsage({
  auth,
  paginationParams,
  includeAlertLinks = false,
}: {
  auth: Authenticator;
  paginationParams: MembersUsagePaginationInput;
  includeAlertLinks?: boolean;
}): Promise<GetMembersUsageResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  const metronomeContractId = subscription?.metronomeContractId ?? null;

  const usersResult = await UserResource.searchUsers(auth, {
    searchTerm: paginationParams.search ?? "",
    offset: paginationParams.offset,
    limit: paginationParams.limit,
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
    perUserSpendLimits,
  ] = await Promise.all([
    MembershipResource.getActiveMemberships({ workspace, users }),
    fetchPerUserUsageCreditsForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    fetchSeatDataForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    fetchEffectivePerUserSpendLimits({
      metronomeCustomerId: metronomeCustomerId ?? null,
      workspaceId: workspace.sId,
    }),
  ]);
  const { perUserOverrides, defaultAwuCreditsBySeatType } = perUserSpendLimits;

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
    // override if any. Each carries the backing Metronome alert id so the UI
    // can deep-link to the effective cap.
    const normalizedSeatType = normalizeToPoolLimitSeatType(
      membership.seatType
    );
    const defaultCap = normalizedSeatType
      ? (defaultAwuCreditsBySeatType[normalizedSeatType] ?? null)
      : null;
    const overrideCap = perUserOverrides.get(userId) ?? null;

    const spendLimitSource = resolveEffectiveSpendLimitSource({
      overrideAwuCredits: overrideCap?.threshold ?? null,
      defaultAwuCredits: defaultCap?.threshold ?? null,
    });
    const effectiveCap =
      spendLimitSource === "override"
        ? overrideCap
        : spendLimitSource === "default"
          ? defaultCap
          : null;
    const spendLimitAlertId = includeAlertLinks
      ? (effectiveCap?.alertId ?? null)
      : null;
    const spendLimitWarningAlertId = includeAlertLinks
      ? (effectiveCap?.warningAlertId ?? null)
      : null;

    return [
      {
        sId: userId,
        name: u.name,
        email: u.email ?? null,
        image: u.imageUrl ?? null,
        seatType: membership.seatType ?? null,
        memberUsageLimit: awuAllocation > 0 ? awuAllocation : null,
        consumedAwuCredits: totalConsumedCredits,
        consumedFromAllowanceAwuCredits,
        consumedFromPoolAwuCredits,
        billingFrequency: seatData?.billingFrequency ?? null,
        scheduledSeatType: scheduled?.seatType ?? null,
        scheduledSeatChangeAt: scheduled?.startAt.toISOString() ?? null,
        spendLimitAwuCredits: resolveEffectiveSpendLimitAwuCredits({
          overrideAwuCredits: overrideCap?.threshold ?? null,
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
