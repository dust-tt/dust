import type { Authenticator } from "@app/lib/auth";
import { listMetronomePerUserCapsForWorkspace } from "@app/lib/metronome/per_user_alerts";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { buildSeatDataByUserId, type SeatData } from "@app/lib/metronome/seats";
import type { BillingFrequency } from "@app/lib/metronome/types";
import {
  MembershipResource,
  type MembershipsPaginationParams,
} from "@app/lib/resources/membership_resource";
import type { MembershipSeatType } from "@app/types/memberships";
import { z } from "zod";

export type MemberUsageType = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  seatType: MembershipSeatType | null;
  // Percentage of seat allocation consumed (0–100), null when seat balances are unavailable.
  seatUsagePercent: number | null;
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
  nextPageUrl?: string;
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
  orderColumn: z.literal("createdAt").catch("createdAt"),
  orderDirection: z.enum(["asc", "desc"]).catch("desc"),
  lastValue: z.coerce.number().optional().catch(undefined),
});

export type MembersUsagePaginationInput = z.infer<
  typeof MembersUsagePaginationSchema
>;

function buildUrlWithParams(
  currentUrl: string,
  newParams: MembershipsPaginationParams | undefined
) {
  if (!newParams) {
    return undefined;
  }
  const url = new URL(currentUrl);
  Object.entries(newParams).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, value.toString());
    }
  });
  return url.pathname + url.search;
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
  const result = await fetchPerUserAwuUsage({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (result.isErr()) {
    return new Map();
  }
  return result.value;
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
  return buildSeatDataByUserId({
    metronomeCustomerId,
    contractId: metronomeContractId,
  });
}

async function fetchPerUserSpendLimitsForMembersTable({
  metronomeCustomerId,
  workspaceId,
}: {
  metronomeCustomerId: string | null;
  workspaceId: string;
}): Promise<Map<string, number>> {
  if (!metronomeCustomerId) {
    return new Map();
  }
  const result = await listMetronomePerUserCapsForWorkspace({
    metronomeCustomerId,
    workspaceId,
  });
  if (result.isErr()) {
    return new Map();
  }
  return result.value;
}

export async function getMembersUsage({
  auth,
  paginationParams,
  currentUrl,
}: {
  auth: Authenticator;
  paginationParams: MembersUsagePaginationInput;
  currentUrl: string;
}): Promise<GetMembersUsageResponseBody> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  const metronomeContractId = subscription?.metronomeContractId ?? null;

  const [
    membershipsResult,
    perUserTotalCredits,
    seatDataByUserId,
    perUserSpendLimits,
  ] = await Promise.all([
    MembershipResource.getActiveMemberships({
      workspace,
      paginationParams,
    }),
    fetchPerUserUsageCreditsForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    fetchSeatDataForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      metronomeContractId,
    }),
    fetchPerUserSpendLimitsForMembersTable({
      metronomeCustomerId: metronomeCustomerId ?? null,
      workspaceId: workspace.sId,
    }),
  ]);

  const { memberships, total, nextPageParams } = membershipsResult;

  const scheduledByUserId =
    await MembershipResource.getScheduledMembershipsByUserIdInWorkspace({
      workspace,
      userIds: memberships.map((m) => m.userId),
    });

  const membersUsage: MemberUsageType[] = memberships.flatMap((m) => {
    if (!m.user) {
      return [];
    }
    const userId = m.user.sId;
    const totalCredits = perUserTotalCredits.get(userId) ?? 0;
    const seatData = seatDataByUserId.get(userId);
    const awuAllocation = seatData?.awuAllocation ?? 0;

    let seatUsagePercent: number | null = null;
    if (awuAllocation > 0) {
      const seatConsumed = Math.min(totalCredits, awuAllocation);
      seatUsagePercent = (seatConsumed / awuAllocation) * 100;
    }

    const scheduled = scheduledByUserId.get(m.userId);

    return [
      {
        sId: userId,
        name: m.user.name,
        email: m.user.email ?? null,
        image: m.user.imageUrl ?? null,
        seatType: m.seatType ?? null,
        seatUsagePercent,
        consumedAwuCredits: totalCredits,
        billingFrequency: seatData?.billingFrequency ?? null,
        scheduledSeatType: scheduled?.seatType ?? null,
        scheduledSeatChangeAt: scheduled?.startAt.toISOString() ?? null,
        spendLimitAwuCredits: perUserSpendLimits.get(userId) ?? null,
      },
    ];
  });

  return {
    members: membersUsage,
    total,
    nextPageUrl: buildUrlWithParams(currentUrl, nextPageParams),
  };
}
