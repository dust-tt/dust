import type { Authenticator } from "@app/lib/auth";
import { amountCents } from "@app/lib/metronome/amounts";
import {
  listMetronomeBalances,
  listMetronomeDraftInvoices,
} from "@app/lib/metronome/client";
import {
  CREDIT_TYPE_EUR_ID,
  CREDIT_TYPE_USD_ID,
  getCreditTypeAwuId,
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
} from "@app/lib/metronome/seat_types";
import type { AwuPoolSummaryResponseBody } from "@app/types/api/credits/awu_pool_summary";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber } from "@app/types/shared/utils/general";

function creditTypeIdToCurrency(
  creditTypeId: string
): SupportedCurrency | null {
  if (creditTypeId === CREDIT_TYPE_USD_ID) {
    return "usd";
  }
  if (creditTypeId === CREDIT_TYPE_EUR_ID) {
    return "eur";
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

  const [balancesResult, invoicesResult] = await Promise.all([
    listMetronomeBalances(metronomeCustomerId),
    listMetronomeDraftInvoices(metronomeCustomerId),
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
    });
  }

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
      (entry.contract?.id === metronomeContractId || !entry.contract)
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

  return new Ok({
    totalRemainingCredits,
    totalActiveCredits,
    overageCredits,
    overageAmountCents,
    overageCurrency: overageCredits !== null ? overageCurrency : null,
  });
}
