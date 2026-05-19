import type { Authenticator } from "@app/lib/auth";
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
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type AwuPoolSummaryResponseBody = {
  totalCredits: number;
  consumedByUsersCredits: number;
  consumedByProgrammaticCredits: number;
  resetDate: string;
};

export class AwuPoolSummaryError extends Error {
  constructor(
    readonly type:
      | "metronome_not_configured"
      | "balances_fetch_failed"
      | "invoices_fetch_failed"
      | "usage_fetch_failed",
    readonly details: { cause?: string } = {}
  ) {
    super(type);
  }
}

/**
 * Maps an AWU pool summary error to the standard `{ status_code, api_error }`
 * shape. Use this from any framework (Next or Hono) — only the response
 * dispatch differs.
 */
export function getAwuPoolSummaryApiError(
  err: AwuPoolSummaryError
): APIErrorWithStatusCode {
  switch (err.type) {
    case "metronome_not_configured":
      return {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Workspace is not configured for Metronome billing.",
        },
      };
    case "balances_fetch_failed":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome balances: ${err.details.cause ?? ""}`,
        },
      };
    case "invoices_fetch_failed":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome invoices: ${err.details.cause ?? ""}`,
        },
      };
    case "usage_fetch_failed":
      return {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to retrieve Metronome usage: ${err.details.cause ?? ""}`,
        },
      };
    default:
      assertNever(err.type);
  }
}

export async function getAwuPoolSummary(
  auth: Authenticator
): Promise<Result<AwuPoolSummaryResponseBody, AwuPoolSummaryError>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || !subscription?.metronomeContractId) {
    return new Err(new AwuPoolSummaryError("metronome_not_configured"));
  }
  const { metronomeContractId } = subscription;

  const [balancesResult, invoicesResult] = await Promise.all([
    listMetronomeBalances(metronomeCustomerId),
    listMetronomeDraftInvoices(metronomeCustomerId),
  ]);

  if (balancesResult.isErr()) {
    return new Err(
      new AwuPoolSummaryError("balances_fetch_failed", {
        cause: balancesResult.error.message,
      })
    );
  }
  if (invoicesResult.isErr()) {
    return new Err(
      new AwuPoolSummaryError("invoices_fetch_failed", {
        cause: invoicesResult.error.message,
      })
    );
  }

  const now = Date.now();

  // Find the canonical billing period end from the current draft invoice.
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
    return new Ok({
      totalCredits: 0,
      consumedByUsersCredits: 0,
      consumedByProgrammaticCredits: 0,
      resetDate: "",
    });
  }

  const resetDate = ceilToMidnightUTC(
    new Date(currentInvoice.end_timestamp)
  ).toISOString();

  // Filter to active, non-seat AWU pool credits and commits.
  const awuCreditTypeId = getCreditTypeAwuId();
  const seatProductIds = getSeatProductIds();
  const awuBalances = balancesResult.value.filter(
    (entry) =>
      entry.access_schedule?.credit_type?.id === awuCreditTypeId &&
      !seatProductIds.has(entry.product.id)
  );

  // Sum the remaining balance of each active pool credit.
  // entry.balance accounts for prior-period consumption (e.g. a carried-over prepaid
  // top-off that was partially consumed in a previous billing cycle). Upcoming and
  // expired schedule segments contribute 0 to the balance, so this is safe for
  // multi-period recurring credits too.
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

  // Query usage per user and seat allocations in parallel.
  // Per-user breakdown is needed to compute pool overflow correctly:
  // seat credits cover each user up to their allocation; only the excess
  // draws from the workspace pool.
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
    return new Err(
      new AwuPoolSummaryError("usage_fetch_failed", {
        cause: usageResult.error.message,
      })
    );
  }

  // Aggregate per-user consumption from the usage metric.
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

  // Pool user consumption = sum of each user's overflow beyond their seat allocation.
  // Users without a seat: all their usage is pool consumption.
  let consumedByUsersCredits = 0;
  for (const [userId, userCredits] of perUserCredits) {
    const seatAllocation = seatDataByUserId.get(userId)?.awuAllocation ?? 0;
    consumedByUsersCredits += Math.max(0, userCredits - seatAllocation);
  }

  return new Ok({
    totalCredits,
    consumedByUsersCredits,
    consumedByProgrammaticCredits,
    resetDate,
  });
}
