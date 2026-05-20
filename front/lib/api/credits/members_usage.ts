import type { Authenticator } from "@app/lib/auth";
import { listMetronomePerUserCapsForWorkspace } from "@app/lib/metronome/per_user_alerts";
import { fetchPerUserAwuUsage } from "@app/lib/metronome/per_user_usage";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";
import type { BillingFrequency } from "@app/lib/metronome/types";
import {
  MembershipResource,
  type MembershipsPaginationParams,
} from "@app/lib/resources/membership_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { MembershipSeatType } from "@app/types/memberships";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

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
  // pool. This is the value the per-user spend cap is compared against
  // (the Metronome alert is configured on the same metric); to derive
  // pool overflow, subtract the seat allocation client-side.
  consumedAwuCredits: number;
  // Billing cadence for the seat subscription the user is assigned to; null when unknown.
  billingFrequency: BillingFrequency | null;
  // Set when a future seat change is scheduled (e.g. at the next credit refresh).
  scheduledSeatType: MembershipSeatType | null;
  scheduledSeatChangeAt: string | null;
  // Per-user spend cap in AWU credits (the upper bound on workspace pool
  // consumption). `null` means no cap is set for this user (unlimited
  // within the workspace pool).
  spendLimitAwuCredits: number | null;
};

export type GetMembersUsageResponseBody = {
  members: MemberUsageType[];
  total: number;
  nextPageUrl?: string;
};

export const DEFAULT_MEMBERS_USAGE_PAGE_LIMIT = 50;
export const MAX_MEMBERS_USAGE_PAGE_LIMIT = 150;

const MembersUsagePaginationSchema = z.object({
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

function buildUrlWithParams(
  req: NextApiRequest,
  newParams: MembershipsPaginationParams | undefined
) {
  if (!newParams) {
    return undefined;
  }
  const url = new URL(req.url!, `http://${req.headers.host}`);
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

export async function handleGetMembersUsageRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMembersUsageResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access the members usage list.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const paginationRes = MembersUsagePaginationSchema.safeParse(req.query);
      if (!paginationRes.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid pagination parameters: ${fromError(paginationRes.error).toString()}`,
          },
        });
      }

      const paginationParams = paginationRes.data;
      const workspace = auth.getNonNullableWorkspace();
      const subscription = auth.subscription();
      const { metronomeCustomerId } = workspace;
      const metronomeContractId = subscription?.metronomeContractId ?? null;

      const [
        membershipsResult,
        perUserTotalCredits,
        seatDataByUserId,
        perUserSpendLimitsResult,
      ] = await Promise.all([
        MembershipResource.getActiveMemberships({
          workspace,
          paginationParams,
        }),
        fetchPerUserUsageCreditsForMembersTable({
          metronomeCustomerId: metronomeCustomerId ?? null,
          metronomeContractId,
        }),
        metronomeCustomerId && metronomeContractId
          ? buildSeatDataByUserId({
              metronomeCustomerId,
              contractId: metronomeContractId,
            })
          : Promise.resolve(new Map()),
        metronomeCustomerId
          ? listMetronomePerUserCapsForWorkspace({
              metronomeCustomerId,
              workspaceSId: workspace.sId,
            })
          : Promise.resolve(null),
      ]);

      const perUserSpendLimits =
        perUserSpendLimitsResult && perUserSpendLimitsResult.isOk()
          ? perUserSpendLimitsResult.value
          : new Map<string, number>();

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

      return res.status(200).json({
        members: membersUsage,
        total,
        nextPageUrl: buildUrlWithParams(req, nextPageParams),
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}
