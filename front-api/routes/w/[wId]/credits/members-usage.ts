import { Hono } from "hono";
import { z } from "zod";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeDraftInvoices,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import { getMetricLlmProviderCostAwuId } from "@app/lib/metronome/constants";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";
import type { BillingFrequency } from "@app/lib/metronome/types";
import {
  MembershipResource,
  type MembershipsPaginationParams,
} from "@app/lib/resources/membership_resource";
import type { MembershipSeatType } from "@app/types/memberships";

export type MemberUsageType = {
  sId: string;
  name: string;
  email: string | null;
  image: string | null;
  seatType: MembershipSeatType | null;
  seatUsagePercent: number | null;
  consumedWorkplacePoolCredits: number;
  billingFrequency: BillingFrequency | null;
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

async function fetchPerUserUsageCredits({
  metronomeCustomerId,
  metronomeContractId,
}: {
  metronomeCustomerId: string | null;
  metronomeContractId: string | null;
}): Promise<Map<string, number>> {
  if (!metronomeCustomerId || !metronomeContractId) {
    return new Map();
  }

  const invoicesResult = await listMetronomeDraftInvoices(metronomeCustomerId);
  if (invoicesResult.isErr()) {
    return new Map();
  }

  const now = Date.now();
  const currentInvoice = invoicesResult.value.find((inv) => {
    if (inv.contract_id !== metronomeContractId) {
      return false;
    }
    if (!inv.start_timestamp || !inv.end_timestamp) {
      return false;
    }
    const startMs = new Date(inv.start_timestamp).getTime();
    const endMs = new Date(inv.end_timestamp).getTime();
    return startMs <= now && now < endMs;
  });

  if (!currentInvoice?.start_timestamp || !currentInvoice.end_timestamp) {
    return new Map();
  }

  const startingOn = floorToMidnightUTC(
    new Date(currentInvoice.start_timestamp)
  ).toISOString();
  const endingBefore = ceilToMidnightUTC(
    new Date(currentInvoice.end_timestamp)
  ).toISOString();

  const usageResult = await listMetronomeUsageWithGroups({
    customerId: metronomeCustomerId,
    billableMetricId: getMetricLlmProviderCostAwuId(),
    startingOn,
    endingBefore,
    windowSize: "NONE",
    groupKey: ["user_id", "usage_type"],
  });

  if (usageResult.isErr()) {
    return new Map();
  }

  const perUser = new Map<string, number>();
  for (const entry of usageResult.value) {
    const userId = entry.group?.["user_id"];
    const usageType = entry.group?.["usage_type"];
    if (!userId || usageType !== "user" || entry.value === null) {
      continue;
    }
    const existing = perUser.get(userId) ?? 0;
    perUser.set(userId, existing + entry.value);
  }
  return perUser;
}

// Mounted at /api/w/:wId/credits/members-usage.
const app = new Hono();

app.use("*", workspaceAuth());

app.get("/", validate("query", MembersUsagePaginationSchema), async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access the members usage list.",
      },
    });
  }

  const paginationParams = c.req.valid("query");
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  const metronomeContractId = subscription?.metronomeContractId ?? null;

  const [membershipsResult, perUserTotalCredits, seatDataByUserId] =
    await Promise.all([
      MembershipResource.getActiveMemberships({
        workspace,
        paginationParams,
      }),
      fetchPerUserUsageCredits({
        metronomeCustomerId: metronomeCustomerId ?? null,
        metronomeContractId,
      }),
      metronomeCustomerId && metronomeContractId
        ? buildSeatDataByUserId({
            metronomeCustomerId,
            contractId: metronomeContractId,
          })
        : Promise.resolve(new Map()),
    ]);

  const { memberships, total, nextPageParams } = membershipsResult;

  const membersUsage: MemberUsageType[] = memberships.flatMap((m) => {
    if (!m.user) {
      return [];
    }
    const userId = m.user.sId;
    const totalCredits = perUserTotalCredits.get(userId) ?? 0;
    const seatData = seatDataByUserId.get(userId);
    const awuAllocation = seatData?.awuAllocation ?? 0;

    let seatUsagePercent: number | null = null;
    let poolConsumedCredits = totalCredits;

    if (awuAllocation > 0) {
      const seatConsumed = Math.min(totalCredits, awuAllocation);
      seatUsagePercent = (seatConsumed / awuAllocation) * 100;
      poolConsumedCredits = Math.max(0, totalCredits - awuAllocation);
    }

    return [
      {
        sId: userId,
        name: m.user.name,
        email: m.user.email ?? null,
        image: m.user.imageUrl ?? null,
        seatType: m.seatType ?? null,
        seatUsagePercent,
        consumedWorkplacePoolCredits: poolConsumedCredits,
        billingFrequency: seatData?.billingFrequency ?? null,
      },
    ];
  });

  const body: GetMembersUsageResponseBody = {
    members: membersUsage,
    total,
    nextPageUrl: buildUrlWithParams(c.req.url, nextPageParams),
  };
  return c.json(body);
});

export default app;
