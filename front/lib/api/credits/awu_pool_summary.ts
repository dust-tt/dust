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
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
} from "@app/lib/metronome/seat_types";
import { buildSeatDataByUserId } from "@app/lib/metronome/seats";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

export type AwuPoolSummaryResponseBody = {
  totalCredits: number;
  consumedByUsersCredits: number;
  consumedByProgrammaticCredits: number;
  resetDate: string;
};

export async function handleAwuPoolSummaryRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<AwuPoolSummaryResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can view credits.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const workspace = auth.getNonNullableWorkspace();
      const subscription = auth.subscription();
      const { metronomeCustomerId } = workspace;
      if (!metronomeCustomerId || !subscription?.metronomeContractId) {
        return apiError(req, res, {
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
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve Metronome balances: ${balancesResult.error.message}`,
          },
        });
      }
      if (invoicesResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve Metronome invoices: ${invoicesResult.error.message}`,
          },
        });
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
        return res.status(200).json({
          totalCredits: 0,
          consumedByUsersCredits: 0,
          consumedByProgrammaticCredits: 0,
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
      if (!activeContract) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Workspace is not configured for Metronome billing.",
          },
        });
      }
      const productSeatTypes = await getProductSeatTypes();
      const seatProductIds = new Set(
        getSeatTypesByProductIdFromContract(
          activeContract,
          productSeatTypes
        ).keys()
      );
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
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve Metronome usage: ${usageResult.error.message}`,
          },
        });
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
            perUserCredits.set(
              userId,
              (perUserCredits.get(userId) ?? 0) + credits
            );
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

      return res.status(200).json({
        totalCredits,
        consumedByUsersCredits,
        consumedByProgrammaticCredits,
        resetDate,
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
