import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeBalances,
  listMetronomeDraftInvoices,
  listMetronomeUsageWithGroups,
} from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getMetricLlmProviderCostAwuId,
  getSeatProductIds,
} from "@app/lib/metronome/constants";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";

export type AwuPoolSummaryResponseBody = {
  totalCredits: number;
  consumedByUsersCredits: number;
  consumedByProgrammaticCredits: number;
  resetDate: string;
};

// Mounted at /api/w/:wId/credits/awu-pool-summary.
const app = new Hono();

app.use("*", workspaceAuth());

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || !subscription?.metronomeContractId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Workspace is not configured for Metronome billing.",
      },
    });
  }
  const { metronomeContractId } = subscription;

  const [balancesResult, invoicesResult] = await Promise.all([
    listMetronomeBalances(metronomeCustomerId),
    listMetronomeDraftInvoices(metronomeCustomerId),
  ]);

  if (balancesResult.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve Metronome balances: ${balancesResult.error.message}`,
      },
    });
  }
  if (invoicesResult.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve Metronome invoices: ${invoicesResult.error.message}`,
      },
    });
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
    const emptyBody: AwuPoolSummaryResponseBody = {
      totalCredits: 0,
      consumedByUsersCredits: 0,
      consumedByProgrammaticCredits: 0,
      resetDate: "",
    };
    return c.json(emptyBody);
  }

  const resetDate = ceilToMidnightUTC(
    new Date(currentInvoice.end_timestamp)
  ).toISOString();

  const awuCreditTypeId = getCreditTypeAwuId();
  const seatProductIds = getSeatProductIds();
  const awuBalances = balancesResult.value.filter(
    (entry) =>
      entry.access_schedule?.credit_type?.id === awuCreditTypeId &&
      !seatProductIds.has(entry.product.id)
  );

  let totalCredits = 0;
  for (const entry of awuBalances) {
    const isActive = (entry.access_schedule?.schedule_items ?? []).some(
      (item) => {
        const itemStartMs = new Date(item.starting_at).getTime();
        const itemEndMs = new Date(item.ending_before).getTime();
        return itemStartMs <= now && now < itemEndMs;
      }
    );
    if (isActive) {
      totalCredits += entry.balance ?? 0;
    }
  }

  const startingOn = floorToMidnightUTC(
    new Date(currentInvoice.start_timestamp)
  ).toISOString();
  const endingBefore = ceilToMidnightUTC(
    new Date(currentInvoice.end_timestamp)
  ).toISOString();

  const [usageResult, seatDataByUserId] = await Promise.all([
    listMetronomeUsageWithGroups({
      customerId: metronomeCustomerId,
      billableMetricId: getMetricLlmProviderCostAwuId(),
      startingOn,
      endingBefore,
      windowSize: "NONE",
      groupKey: ["user_id", "usage_type"],
    }),
    buildSeatDataByUserId({
      metronomeCustomerId,
      contractId: metronomeContractId,
    }),
  ]);

  if (usageResult.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve Metronome usage: ${usageResult.error.message}`,
      },
    });
  }

  const perUserCredits = new Map<string, number>();
  let consumedByProgrammaticCredits = 0;

  for (const row of usageResult.value) {
    const credits = row.value ?? 0;
    const usageType = row.group?.["usage_type"];
    if (usageType === "programmatic") {
      consumedByProgrammaticCredits += credits;
    } else {
      const userId = row.group?.["user_id"];
      if (userId) {
        perUserCredits.set(userId, (perUserCredits.get(userId) ?? 0) + credits);
      }
    }
  }

  let consumedByUsersCredits = 0;
  for (const [userId, userCredits] of perUserCredits) {
    const seatAllocation = seatDataByUserId.get(userId)?.awuAllocation ?? 0;
    consumedByUsersCredits += Math.max(0, userCredits - seatAllocation);
  }

  const body: AwuPoolSummaryResponseBody = {
    totalCredits,
    consumedByUsersCredits,
    consumedByProgrammaticCredits,
    resetDate,
  };
  return c.json(body);
});

export default app;
