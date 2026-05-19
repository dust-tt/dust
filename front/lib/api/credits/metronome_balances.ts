import type { Authenticator } from "@app/lib/auth";
import { listMetronomeBalances } from "@app/lib/metronome/client";
import { getCreditTypeProgrammaticUsdId } from "@app/lib/metronome/constants";
import type {
  MetronomeCommit,
  MetronomeCredit,
} from "@app/lib/metronome/types";
import {
  isMetronomeExcessCredit,
  METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD,
} from "@app/lib/metronome/types";
import type {
  CreditDisplayData,
  CreditType,
  GetCreditsResponseBody,
} from "@app/types/credits";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  assertNever,
  assertNeverAndIgnore,
} from "@app/types/shared/utils/assert_never";

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
  entry: MetronomeCommit | MetronomeCredit
): CreditDisplayData {
  const type = mapMetronomeType(entry);
  const { initialAmountCredits, startDateMs, expirationDateMs } =
    getScheduleTotals(entry);

  const initialAmountMicroUsd =
    initialAmountCredits * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;
  const balanceCredits = entry.balance ?? 0;
  const remainingAmountMicroUsd =
    balanceCredits * METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD;
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

export class MetronomeBalancesError extends Error {
  constructor(
    readonly type: "metronome_not_configured" | "balances_fetch_failed",
    readonly details: { cause?: string } = {}
  ) {
    super(type);
  }
}

/**
 * Maps a metronome balances error to the standard `{ status_code, api_error }`
 * shape. Use this from any framework (Next or Hono) — only the response
 * dispatch differs.
 */
export function getMetronomeBalancesApiError(
  err: MetronomeBalancesError
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
    default:
      assertNever(err.type);
  }
}

export async function getMetronomeBalances(
  auth: Authenticator
): Promise<Result<GetCreditsResponseBody, MetronomeBalancesError>> {
  const workspace = auth.getNonNullableWorkspace();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return new Err(new MetronomeBalancesError("metronome_not_configured"));
  }

  const result = await listMetronomeBalances(metronomeCustomerId);
  if (result.isErr()) {
    return new Err(
      new MetronomeBalancesError("balances_fetch_failed", {
        cause: result.error.message,
      })
    );
  }

  const programmaticUsdCreditTypeId = getCreditTypeProgrammaticUsdId();
  const credits: CreditDisplayData[] = result.value
    .filter(
      (entry) =>
        entry.access_schedule?.credit_type?.id ===
          programmaticUsdCreditTypeId && !isMetronomeExcessCredit(entry)
    )
    .map(metronomeBalanceToDisplayData);

  return new Ok({ credits });
}
