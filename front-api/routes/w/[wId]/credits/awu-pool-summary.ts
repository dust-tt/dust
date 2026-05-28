import {
  ceilToMidnightUTC,
  listMetronomeBalances,
  listMetronomeDraftInvoices,
} from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
} from "@app/lib/metronome/seat_types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type AwuPoolSummaryResponseBody = {
  totalRemainingCredits: number;
  totalActiveCredits: number;
  resetDate: string;
};

// Mounted at /api/w/:wId/credits/awu-pool-summary.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<AwuPoolSummaryResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
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
    return apiError(ctx, {
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
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to retrieve Metronome balances: ${balancesResult.error.message}`,
      },
    });
  }
  if (invoicesResult.isErr()) {
    return apiError(ctx, {
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
    return ctx.json({
      totalRemainingCredits: 0,
      totalActiveCredits: 0,
      resetDate: "",
    });
  }

  const resetDate = ceilToMidnightUTC(
    new Date(currentInvoice.end_timestamp)
  ).toISOString();

  // Filter to active, non-seat AWU pool credits and commits. The set of
  // seat product IDs is derived from the contract's tagged subscriptions
  // (via the `DUST_SEAT_TYPE` custom field) rather than a hardcoded list.
  const awuCreditTypeId = getCreditTypeAwuId();
  const activeContract = await getActiveContract(workspace.sId);
  const productSeatTypes = await getProductSeatTypes();
  const seatProductIds = activeContract
    ? new Set(
        getSeatTypesByProductIdFromContract(
          activeContract,
          productSeatTypes
        ).keys()
      )
    : new Set<string>();
  const awuBalances = balancesResult.value.filter(
    (entry) =>
      entry.access_schedule?.credit_type?.id === awuCreditTypeId &&
      !seatProductIds.has(entry.product.id) &&
      entry.contract?.id === metronomeContractId
  );

  let totalRemainingCredits = 0;
  let totalActiveCredits = 0;
  for (const entry of awuBalances) {
    const scheduleItems = entry.access_schedule?.schedule_items ?? [];
    const isActive = scheduleItems.some((item) => {
      const itemStartMs = new Date(item.starting_at).getTime();
      const itemEndMs = new Date(item.ending_before).getTime();
      return itemStartMs <= now && now < itemEndMs;
    });
    if (isActive) {
      totalRemainingCredits += entry.balance ?? 0;
      for (const item of scheduleItems) {
        totalActiveCredits += item.amount;
      }
    }
  }

  return ctx.json({
    totalRemainingCredits,
    totalActiveCredits,
    resetDate,
  });
});

export default app;
