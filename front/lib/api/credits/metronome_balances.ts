import type {
  MetronomeCommit,
  MetronomeCredit,
} from "@app/lib/metronome/types";
import { METRONOME_PROGRAMMATIC_USAGE_CREDIT_TO_MICRO_USD } from "@app/lib/metronome/types";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";

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
