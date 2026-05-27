import type { Authenticator } from "@app/lib/auth";
import {
  getCachedDefaultCapThreshold,
  getCachedPerUserCapThresholds,
  getMetronomeDefaultUserCapAlert,
  listMetronomePerUserCapsForWorkspace,
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
import { resolveEffectiveSpendLimitAwuCredits } from "@app/lib/spend_limits/effective";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
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
  // Billing cadence for the seat subscription the user is assigned to; null when unknown.
  billingFrequency: BillingFrequency | null;
  // Set when a future seat change is scheduled (e.g. at the next credit refresh).
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  // Per-user total spend cap in AWU credits for the billing period
  spendLimitAwuCredits: number | null;
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
  return buildSeatDataByUserId({
    metronomeCustomerId,
    contractId: metronomeContractId,
  });
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
}): Promise<Map<string, number>> {
  const result = await listMetronomePerUserCapsForWorkspace({
    metronomeCustomerId,
    workspaceId,
  });
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId },
      "[MembersUsage] Failed to fetch per-user spend caps"
    );
    return new Map();
  }

  const thresholds = new Map<string, number>();
  for (const [userId, entry] of result.value) {
    thresholds.set(userId, entry.alert.threshold);
  }

  return thresholds;
}

async function fetchDefaultCapUncached({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<number | null> {
  const result = await getMetronomeDefaultUserCapAlert({
    metronomeCustomerId,
    workspaceId,
  });
  if (result.isErr()) {
    logger.warn(
      { err: result.error, workspaceId },
      "[MembersUsage] Failed to fetch default spend cap"
    );
    return null;
  }

  return result.value?.alert.threshold ?? null;
}

/**
 * Resolve the effective per-user spend limit for the members table:
 *   - if the user has a per-user override, the override threshold wins
 *   - otherwise, the workspace default (if any) applies
 *   - otherwise, the user is uncapped (`null`)
 *
 * Returns a `{ perUser, default }` pair so the caller can compute the
 * effective value with `perUser.get(userId) ?? default` for each member —
 * including members that don't appear in the overrides map.
 */
async function fetchEffectivePerUserSpendLimits({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
}): Promise<{
  perUserOverrides: Map<string, number>;
  defaultAwuCredits: number | null;
}> {
  if (!metronomeCustomerId) {
    return { perUserOverrides: new Map(), defaultAwuCredits: null };
  }

  const [perUserOverrides, defaultAwuCredits] = await Promise.all([
    fetchPerUserCapOverrides({ metronomeCustomerId, workspaceId }),
    fetchDefaultCap({ metronomeCustomerId, workspaceId }),
  ]);

  return { perUserOverrides, defaultAwuCredits };
}

async function fetchPerUserCapOverrides({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<Map<string, number>> {
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

async function fetchDefaultCap({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
}): Promise<number | null> {
  try {
    const { threshold } = await getCachedDefaultCapThreshold({
      metronomeCustomerId,
      workspaceId,
    });
    return threshold;
  } catch (err) {
    logger.warn(
      { err: normalizeError(err), workspaceId },
      "[MembersUsage] Failed to read cached default spend cap, falling back to uncached fetch"
    );
    return fetchDefaultCapUncached({
      metronomeCustomerId,
      workspaceId,
    });
  }
}

export async function getMembersUsage({
  auth,
  paginationParams,
}: {
  auth: Authenticator;
  paginationParams: MembersUsagePaginationInput;
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
  const { perUserOverrides, defaultAwuCredits } = perUserSpendLimits;

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

    return [
      {
        sId: userId,
        name: u.name,
        email: u.email ?? null,
        image: u.imageUrl ?? null,
        seatType: membership.seatType ?? null,
        memberUsageLimit: awuAllocation > 0 ? awuAllocation : null,
        consumedAwuCredits: totalConsumedCredits,
        billingFrequency: seatData?.billingFrequency ?? null,
        scheduledSeatType: scheduled?.seatType ?? null,
        scheduledSeatChangeAt: scheduled?.startAt.toISOString() ?? null,
        spendLimitAwuCredits: resolveEffectiveSpendLimitAwuCredits({
          overrideAwuCredits: perUserOverrides.get(userId) ?? null,
          defaultAwuCredits,
        }),
      },
    ];
  });

  return {
    members: membersUsage,
    total,
  };
}
