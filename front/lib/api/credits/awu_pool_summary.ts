import type { Authenticator } from "@app/lib/auth";
import {
  ceilToMidnightUTC,
  floorToMidnightUTC,
  listMetronomeBalances,
  listMetronomeDraftInvoices,
  listMetronomeUsage,
} from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getMetricLlmCostAwuProgrammaticId,
  getMetricLlmCostAwuUserId,
} from "@app/lib/metronome/constants";
import { METRONOME_USER_CREDIT_TO_MICRO_USD } from "@app/lib/metronome/types";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";

export type AwuPoolSummaryResponseBody = {
  totalAmountMicroUsd: number;
  consumedByUsersMicroUsd: number;
  consumedByProgrammaticMicroUsd: number;
  resetDate: string;
};

import type { NextApiRequest, NextApiResponse } from "next";

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
          totalAmountMicroUsd: 0,
          consumedByUsersMicroUsd: 0,
          consumedByProgrammaticMicroUsd: 0,
          resetDate: "",
        });
      }

      const startingOn = floorToMidnightUTC(
        new Date(currentInvoice.start_timestamp)
      ).toISOString();
      const endingBefore = ceilToMidnightUTC(
        new Date(currentInvoice.end_timestamp)
      ).toISOString();
      const resetDate = endingBefore;

      // Sum the AWU pool size from active balance entries within the current billing period.
      const awuCreditTypeId = getCreditTypeAwuId();
      const awuBalances = balancesResult.value.filter(
        (entry) => entry.access_schedule?.credit_type?.id === awuCreditTypeId
      );

      let totalAmountMicroUsd = 0;
      for (const entry of awuBalances) {
        for (const item of entry.access_schedule?.schedule_items ?? []) {
          const itemStartMs = new Date(item.starting_at).getTime();
          const itemEndMs = new Date(item.ending_before).getTime();
          if (itemStartMs <= now && now < itemEndMs) {
            totalAmountMicroUsd +=
              item.amount * METRONOME_USER_CREDIT_TO_MICRO_USD;
          }
        }
      }

      const [userResult, programmaticResult] = await Promise.all([
        listMetronomeUsage({
          customerIds: [metronomeCustomerId],
          billableMetricIds: [getMetricLlmCostAwuUserId()],
          startingOn,
          endingBefore,
          windowSize: "NONE",
        }),
        listMetronomeUsage({
          customerIds: [metronomeCustomerId],
          billableMetricIds: [getMetricLlmCostAwuProgrammaticId()],
          startingOn,
          endingBefore,
          windowSize: "NONE",
        }),
      ]);

      if (userResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve user AWU usage: ${userResult.error.message}`,
          },
        });
      }

      if (programmaticResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve programmatic AWU usage: ${programmaticResult.error.message}`,
          },
        });
      }

      const consumedByUsersMicroUsd =
        userResult.value.reduce((sum, e) => sum + (e.value ?? 0), 0) *
        METRONOME_USER_CREDIT_TO_MICRO_USD;

      const consumedByProgrammaticMicroUsd =
        programmaticResult.value.reduce((sum, e) => sum + (e.value ?? 0), 0) *
        METRONOME_USER_CREDIT_TO_MICRO_USD;

      return res.status(200).json({
        totalAmountMicroUsd,
        consumedByUsersMicroUsd,
        consumedByProgrammaticMicroUsd,
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
