import type { Authenticator } from "@app/lib/auth";
import { amountCents } from "@app/lib/metronome/amounts";
import {
  listMetronomeBalances,
  listMetronomeDraftInvoices,
  listMetronomeFinalizedInvoices,
} from "@app/lib/metronome/client";
import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_GBP_ID,
  CREDIT_TYPE_USD_ID,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
} from "@app/lib/metronome/seat_types";
import logger from "@app/logger/logger";
import type { AwuPoolSummaryResponseBody } from "@app/types/api/credits/awu_pool_summary";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber } from "@app/types/shared/utils/general";

const CYCLES_FOR_AVERAGE = 5;
// Fetched ahead of the target cycle count so the [contract_id] filter below
// still leaves enough invoices, in case a contract renewal/switch interleaves
// invoices from a superseded contract in the customer's recent history.
const FINALIZED_INVOICES_FETCH_LIMIT = 12;

/**
 * Mean pool credits consumed per finalized billing cycle, over up to the
 * last `CYCLES_FOR_AVERAGE` finalized invoices for this contract. The
 * in-progress cycle has no finalized invoice yet, so it's naturally excluded.
 *
 * Pool consumption per invoice is derived from `usage`-type line items whose
 * `commit_id` matches one of the workspace's pool commits/credits (the same
 * `DUST_CONTRACT_CREDIT_TYPE=pool` tag `listMetronomeBalances` filters on) —
 * Metronome invoices don't expose a single ready-made "pool usage" figure.
 */
async function getAvgPoolCreditsPerCycle({
  metronomeCustomerId,
  metronomeContractId,
  awuCreditTypeId,
}: {
  metronomeCustomerId: string;
  metronomeContractId: string;
  awuCreditTypeId: string;
}): Promise<{
  avgPoolCreditsPerCycle: number | null;
  cyclesUsedForAverage: number;
}> {
  const [poolBalancesResult, finalizedInvoicesResult] = await Promise.all([
    // `coveringDate: null` keeps expired/fully-consumed grants from past
    // cycles — invoices from 2-3 cycles ago reference commits that are no
    // longer active today.
    listMetronomeBalances(metronomeCustomerId, {
      coveringDate: null,
      onlyPoolCredits: true,
    }),
    listMetronomeFinalizedInvoices(metronomeCustomerId, {
      limit: FINALIZED_INVOICES_FETCH_LIMIT,
    }),
  ]);

  if (poolBalancesResult.isErr() || finalizedInvoicesResult.isErr()) {
    logger.error(
      {
        metronomeCustomerId,
        metronomeContractId,
        balancesError: poolBalancesResult.isErr()
          ? poolBalancesResult.error
          : null,
        invoicesError: finalizedInvoicesResult.isErr()
          ? finalizedInvoicesResult.error
          : null,
      },
      "[AwuPoolSummary] Failed to compute avg pool credits per cycle"
    );
    return { avgPoolCreditsPerCycle: null, cyclesUsedForAverage: 0 };
  }

  const poolCommitIds = new Set(
    poolBalancesResult.value
      .filter(
        (entry) => entry.contract?.id === metronomeContractId || !entry.contract
      )
      .map((entry) => entry.id)
  );

  const cycleInvoices = finalizedInvoicesResult.value
    .filter((invoice) => invoice.contract_id === metronomeContractId)
    .slice(0, CYCLES_FOR_AVERAGE);

  if (cycleInvoices.length === 0) {
    return { avgPoolCreditsPerCycle: null, cyclesUsedForAverage: 0 };
  }

  const perCyclePoolCredits = cycleInvoices.map((invoice) =>
    invoice.line_items.reduce((sum, item) => {
      const isPoolFundedAwuUsage =
        item.type === "usage" &&
        item.credit_type.id === awuCreditTypeId &&
        !!item.commit_id &&
        poolCommitIds.has(item.commit_id);
      return isPoolFundedAwuUsage ? sum + (item.quantity ?? 0) : sum;
    }, 0)
  );

  const total = perCyclePoolCredits.reduce((sum, credits) => sum + credits, 0);
  return {
    avgPoolCreditsPerCycle: total / perCyclePoolCredits.length,
    cyclesUsedForAverage: perCyclePoolCredits.length,
  };
}

function creditTypeIdToCurrency(
  creditTypeId: string
): SupportedCurrency | null {
  if (creditTypeId === CREDIT_TYPE_USD_ID) {
    return "usd";
  }
  if (creditTypeId === CREDIT_TYPE_EUR_ID) {
    return "eur";
  }
  if (creditTypeId === CREDIT_TYPE_GBP_ID) {
    return "gbp";
  }
  return null;
}

export class AwuPoolSummaryError extends Error {
  constructor(
    readonly type:
      | "not_configured"
      | "balances_fetch_failed"
      | "invoices_fetch_failed",
    readonly cause?: Error
  ) {
    super(type);
  }
}

export async function getAwuPoolSummary(
  auth: Authenticator
): Promise<Result<AwuPoolSummaryResponseBody, AwuPoolSummaryError>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || !subscription?.metronomeContractId) {
    return new Err(new AwuPoolSummaryError("not_configured"));
  }
  const { metronomeContractId } = subscription;
  const awuCreditTypeId = getCreditTypeAwuId();

  const [balancesResult, invoicesResult, avgPoolCreditsPerCycle] =
    await Promise.all([
      listMetronomeBalances(metronomeCustomerId),
      listMetronomeDraftInvoices(metronomeCustomerId),
      getAvgPoolCreditsPerCycle({
        metronomeCustomerId,
        metronomeContractId,
        awuCreditTypeId,
      }),
    ]);

  if (balancesResult.isErr()) {
    return new Err(
      new AwuPoolSummaryError("balances_fetch_failed", balancesResult.error)
    );
  }
  if (invoicesResult.isErr()) {
    return new Err(
      new AwuPoolSummaryError("invoices_fetch_failed", invoicesResult.error)
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
      totalRemainingCredits: 0,
      totalActiveCredits: 0,
      overageCredits: null,
      overageAmountCents: null,
      overageCurrency: null,
      currentCycleStartMs: null,
      currentCycleEndMs: null,
      latestCreditExpirationMs: null,
      ...avgPoolCreditsPerCycle,
    });
  }

  const currentCycleStartMs = new Date(
    currentInvoice.start_timestamp
  ).getTime();
  const currentCycleEndMs = new Date(currentInvoice.end_timestamp).getTime();

  // PAYG overage on credit-priced contracts shows up as a `cpu_conversion`
  // line item (Metronome converts AWU spend that exceeds the prepaid AWU
  // pool into fiat using the rate-card's `fiat_per_custom_credit`). There is
  // no dedicated overage product — the line's `type` is the signal.
  //   - `quantity` is the number of overage AWU credits consumed
  //   - `total` is the fiat amount in the invoice's native unit (USD in
  //     cents, other currencies in whole units — normalized via amountCents)
  const overageCurrency = creditTypeIdToCurrency(currentInvoice.credit_type.id);
  let overageCredits: number | null = null;
  let overageAmountCents: number | null = null;
  if (overageCurrency) {
    for (const item of currentInvoice.line_items) {
      if (item.type !== "cpu_conversion") {
        continue;
      }
      if (isNumber(item.quantity)) {
        overageCredits = (overageCredits ?? 0) + item.quantity;
      }
      overageAmountCents =
        (overageAmountCents ?? 0) + amountCents(item.total, overageCurrency);
    }
  }

  // Filter to active, non-seat AWU pool credits and commits. The set of
  // seat product IDs is derived from the contract's tagged subscriptions
  // (via the `DUST_SEAT_TYPE` custom field) rather than a hardcoded list.
  // The contract filter prevents sandbox prepaid commits on other contracts
  // from inflating the balance.
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
      (entry.contract?.id === metronomeContractId || !entry.contract)
  );

  let totalRemainingCredits = 0;
  let totalActiveCredits = 0;
  // Furthest-out expiration among the schedule items that are active right
  // now — i.e. when the pool's currently granted credits actually run out,
  // as opposed to when the surrounding contract ends (grants can expire
  // well before the contract does).
  let latestCreditExpirationMs: number | null = null;
  for (const entry of awuBalances) {
    const scheduleItems = entry.access_schedule?.schedule_items ?? [];
    const activeItems = scheduleItems.filter((item) => {
      const itemStartMs = new Date(item.starting_at).getTime();
      const itemEndMs = new Date(item.ending_before).getTime();
      return itemStartMs <= now && now < itemEndMs;
    });
    if (activeItems.length > 0) {
      totalRemainingCredits += entry.balance ?? 0;
      for (const item of scheduleItems) {
        totalActiveCredits += item.amount;
      }
      for (const item of activeItems) {
        const itemEndMs = new Date(item.ending_before).getTime();
        if (
          latestCreditExpirationMs === null ||
          itemEndMs > latestCreditExpirationMs
        ) {
          latestCreditExpirationMs = itemEndMs;
        }
      }
    }
  }

  return new Ok({
    totalRemainingCredits,
    totalActiveCredits,
    overageCredits,
    overageAmountCents,
    overageCurrency: overageCredits !== null ? overageCurrency : null,
    currentCycleStartMs,
    currentCycleEndMs,
    latestCreditExpirationMs,
    ...avgPoolCreditsPerCycle,
  });
}
