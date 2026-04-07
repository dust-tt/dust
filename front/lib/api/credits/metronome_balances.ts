import type { Authenticator } from "@app/lib/auth";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import type {
  MetronomeCommit,
  MetronomeCredit,
} from "@app/lib/metronome/types";
import { METRONOME_CENTS_TO_MICRO_USD } from "@app/lib/metronome/types";
import { apiError } from "@app/logger/withlogging";
import type {
  CreditDisplayData,
  CreditType,
  GetCreditsResponseBody,
} from "@app/types/credits";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

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
  initialAmountCents: number;
  startDateMs: number | null;
  expirationDateMs: number | null;
} {
  const items = entry.access_schedule?.schedule_items ?? [];
  if (items.length === 0) {
    return { initialAmountCents: 0, startDateMs: null, expirationDateMs: null };
  }

  let totalAmountCents = 0;
  let earliestStartMs = new Date(items[0].starting_at).getTime();
  let latestEndMs = new Date(items[0].ending_before).getTime();

  for (const item of items) {
    totalAmountCents += item.amount;
    const startMs = new Date(item.starting_at).getTime();
    const endMs = new Date(item.ending_before).getTime();
    earliestStartMs = Math.min(earliestStartMs, startMs);
    latestEndMs = Math.max(latestEndMs, endMs);
  }

  return {
    initialAmountCents: totalAmountCents,
    startDateMs: earliestStartMs,
    expirationDateMs: latestEndMs,
  };
}

function toDisplayData(
  entry: MetronomeCommit | MetronomeCredit
): CreditDisplayData {
  const type = mapMetronomeType(entry);
  const { initialAmountCents, startDateMs, expirationDateMs } =
    getScheduleTotals(entry);

  const initialAmountMicroUsd =
    initialAmountCents * METRONOME_CENTS_TO_MICRO_USD;
  const balanceCents = entry.balance ?? 0;
  const remainingAmountMicroUsd = balanceCents * METRONOME_CENTS_TO_MICRO_USD;
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

      const credits: CreditDisplayData[] = result.value.map(toDisplayData);

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
