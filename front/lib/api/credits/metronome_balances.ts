import type { Authenticator } from "@app/lib/auth";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getCreditTypeProgrammaticUsdId,
} from "@app/lib/metronome/constants";
import type {
  MetronomeCommit,
  MetronomeCredit,
} from "@app/lib/metronome/types";
import {
  isMetronomeExcessCredit,
  METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD,
  METRONOME_USER_CREDIT_TO_MICRO_USD,
} from "@app/lib/metronome/types";
import { apiError } from "@app/logger/withlogging";
import type {
  CreditDisplayData,
  CreditType,
  GetCreditsResponseBody,
  MetronomeBalanceCreditType,
} from "@app/types/credits";
import { METRONOME_BALANCE_CREDIT_TYPES } from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const MetronomeBalanceCreditTypeSchema = z.enum(METRONOME_BALANCE_CREDIT_TYPES);

const QuerySchema = z.object({
  creditType: MetronomeBalanceCreditTypeSchema,
});

export function getMetronomeCreditTypeId(
  creditType: MetronomeBalanceCreditType
): string {
  switch (creditType) {
    case "programmatic_usage":
      return getCreditTypeProgrammaticUsdId();
    case "users":
      return getCreditTypeAwuId();
    default:
      return assertNever(creditType);
  }
}

function getMetronomeCreditToMicroUsdFactor(
  creditType: MetronomeBalanceCreditType
): number {
  switch (creditType) {
    case "programmatic_usage":
      return METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;
    case "users":
      return METRONOME_USER_CREDIT_TO_MICRO_USD;
    default:
      return assertNever(creditType);
  }
}

function mapMetronomeType(
  entry: MetronomeCommit | MetronomeCredit
): CreditType {
  switch (entry.type) {
    case "CREDIT":
      return "free";
    case "PREPAID":
      return "committed";
    case "POSTPAID":
      return "payg";
    default:
      assertNeverAndIgnore(entry);
      return "free";
  }
}

function getScheduleTotals(entry: MetronomeCommit | MetronomeCredit): {
  initialAmountCredits: number;
  startDateMs: number | null;
  expirationDateMs: number | null;
} {
  const items = entry.access_schedule?.schedule_items ?? [];
  if (items.length === 0) {
    return {
      initialAmountCredits: 0,
      startDateMs: null,
      expirationDateMs: null,
    };
  }

  let totalAmountCredits = 0;
  let earliestStartMs = new Date(items[0].starting_at).getTime();
  let latestEndMs = new Date(items[0].ending_before).getTime();

  for (const item of items) {
    totalAmountCredits += item.amount;
    const startMs = new Date(item.starting_at).getTime();
    const endMs = new Date(item.ending_before).getTime();
    earliestStartMs = Math.min(earliestStartMs, startMs);
    latestEndMs = Math.max(latestEndMs, endMs);
  }

  return {
    initialAmountCredits: totalAmountCredits,
    startDateMs: earliestStartMs,
    expirationDateMs: latestEndMs,
  };
}

export function metronomeBalanceToDisplayData(
  entry: MetronomeCommit | MetronomeCredit,
  creditType: MetronomeBalanceCreditType
): CreditDisplayData {
  const type = mapMetronomeType(entry);
  const { initialAmountCredits, startDateMs, expirationDateMs } =
    getScheduleTotals(entry);
  const creditToMicroUsdFactor = getMetronomeCreditToMicroUsdFactor(creditType);

  const initialAmountMicroUsd = initialAmountCredits * creditToMicroUsdFactor;
  const balanceCredits = entry.balance ?? 0;
  const remainingAmountMicroUsd = balanceCredits * creditToMicroUsdFactor;
  const consumedAmountMicroUsd = Math.max(
    0,
    initialAmountMicroUsd - remainingAmountMicroUsd
  );

  return {
    sId: entry.id,
    type,
    initialAmountMicroUsd,
    remainingAmountMicroUsd,
    consumedAmountMicroUsd,
    startDate: startDateMs,
    expirationDate: expirationDateMs,
    boughtByUser: null,
  };
}

export async function handleMetronomeBalancesRequest(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetCreditsResponseBody>>,
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
      const q = QuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${fromError(q.error).toString()}`,
          },
        });
      }

      const workspace = auth.getNonNullableWorkspace();
      const { metronomeCustomerId } = workspace;
      if (!metronomeCustomerId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Workspace is not configured for Metronome billing.",
          },
        });
      }

      const result = await listMetronomeBalances(metronomeCustomerId);
      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to retrieve Metronome balances: ${result.error.message}`,
          },
        });
      }

      const { creditType } = q.data;
      const creditTypeId = getMetronomeCreditTypeId(creditType);
      const credits: CreditDisplayData[] = result.value
        .filter(
          (entry) =>
            !isMetronomeExcessCredit(entry) &&
            entry.access_schedule?.credit_type?.id === creditTypeId
        )
        .map((entry) => metronomeBalanceToDisplayData(entry, creditType));

      return res.status(200).json({ credits });
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
