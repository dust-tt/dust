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
import type {
  AwuPoolCycleBreakdown,
  AwuPoolSummaryResponseBody,
} from "@app/types/api/credits/awu_pool_summary";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isNumber } from "@app/types/shared/utils/general";
import type { Invoice } from "@metronome/sdk/resources/v1/customers";
import { z } from "zod";

const DEFAULT_CYCLE_HISTORY_LIMIT = 5;
const MAX_CYCLE_HISTORY_LIMIT = 24;

export const AwuPoolSummaryQuerySchema = z.object({
  cycleHistoryLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_CYCLE_HISTORY_LIMIT)
    .catch(DEFAULT_CYCLE_HISTORY_LIMIT),
});

const AUTOMATED_INVOICE_DEDUCTION_LEDGER_TYPES = new Set([
  "PREPAID_COMMIT_AUTOMATED_INVOICE_DEDUCTION",
  "POSTPAID_COMMIT_AUTOMATED_INVOICE_DEDUCTION",
  "CREDIT_AUTOMATED_INVOICE_DEDUCTION",
]);

type PoolLedgerEntry = {
  sourceId: string;
  invoiceId: string;
  amountCredits: number;
  timestampMs: number;
};

async function getPoolLedgerEntries({
  metronomeCustomerId,
  poolCommitIds,
}: {
  metronomeCustomerId: string;
  poolCommitIds: Set<string>;
}): Promise<Result<PoolLedgerEntry[], Error>> {
  const balancesResult = await listMetronomeBalances(metronomeCustomerId, {
    coveringDate: null,
    onlyPoolCredits: false,
    includeArchived: true,
    includeLedgers: true,
  });
  if (balancesResult.isErr()) {
    return new Err(balancesResult.error);
  }

  const entries: PoolLedgerEntry[] = [];
  for (const source of balancesResult.value) {
    if (!poolCommitIds.has(source.id)) {
      continue;
    }
    for (const item of source.ledger ?? []) {
      if (
        !AUTOMATED_INVOICE_DEDUCTION_LEDGER_TYPES.has(item.type) ||
        !("invoice_id" in item)
      ) {
        continue;
      }
      entries.push({
        sourceId: source.id,
        invoiceId: item.invoice_id,
        amountCredits: item.amount,
        timestampMs: new Date(item.timestamp).getTime(),
      });
    }
  }
  return new Ok(entries);
}

function sumPoolLedgerEntriesForInvoice(
  ledgerEntries: PoolLedgerEntry[],
  invoiceId: string
): number {
  return ledgerEntries
    .filter((entry) => entry.invoiceId === invoiceId)
    .reduce((sum, entry) => sum + Math.abs(entry.amountCredits), 0);
}

async function getPoolCommitIds({
  metronomeCustomerId,
}: {
  metronomeCustomerId: string;
}): Promise<Result<Set<string>, Error>> {
  const poolBalancesResult = await listMetronomeBalances(metronomeCustomerId, {
    coveringDate: null,
    onlyPoolCredits: true,
    includeArchived: true,
  });
  if (poolBalancesResult.isErr()) {
    return new Err(poolBalancesResult.error);
  }
  return new Ok(new Set(poolBalancesResult.value.map((entry) => entry.id)));
}

function computeCycleBreakdown({
  finalizedInvoices,
  ledgerEntries,
  cycleHistoryLimit,
}: {
  finalizedInvoices: Invoice[];
  ledgerEntries: PoolLedgerEntry[];
  cycleHistoryLimit: number;
}): AwuPoolCycleBreakdown[] {
  return finalizedInvoices
    .map((invoice) => ({
      cycleStartMs: invoice.start_timestamp
        ? new Date(invoice.start_timestamp).getTime()
        : null,
      cycleEndMs: invoice.end_timestamp
        ? new Date(invoice.end_timestamp).getTime()
        : null,
      consumedCredits: sumPoolLedgerEntriesForInvoice(
        ledgerEntries,
        invoice.id
      ),
    }))
    .filter((cycle) => cycle.consumedCredits > 0)
    .slice(0, cycleHistoryLimit);
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
  auth: Authenticator,
  {
    cycleHistoryLimit = DEFAULT_CYCLE_HISTORY_LIMIT,
  }: {
    cycleHistoryLimit?: number;
  } = {}
): Promise<Result<AwuPoolSummaryResponseBody, AwuPoolSummaryError>> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || !subscription?.metronomeContractId) {
    return new Err(new AwuPoolSummaryError("not_configured"));
  }
  const { metronomeContractId } = subscription;
  const awuCreditTypeId = getCreditTypeAwuId();

  const [
    balancesResult,
    invoicesResult,
    poolCommitIdsResult,
    finalizedInvoicesResult,
  ] = await Promise.all([
    listMetronomeBalances(metronomeCustomerId),
    listMetronomeDraftInvoices(metronomeCustomerId),
    getPoolCommitIds({ metronomeCustomerId }),
    listMetronomeFinalizedInvoices(metronomeCustomerId, {
      limit: cycleHistoryLimit,
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

  let poolCommitIds = new Set<string>();
  // `null` means the ledger couldn't be read (fetch failure)
  let ledgerEntries: PoolLedgerEntry[] | null = null;
  let cycleBreakdown: AwuPoolCycleBreakdown[] = [];
  if (poolCommitIdsResult.isErr() || finalizedInvoicesResult.isErr()) {
    logger.error(
      {
        metronomeCustomerId,
        metronomeContractId,
        poolCommitIdsError: poolCommitIdsResult.isErr()
          ? poolCommitIdsResult.error
          : null,
        invoicesError: finalizedInvoicesResult.isErr()
          ? finalizedInvoicesResult.error
          : null,
      },
      "[AwuPoolSummary] Failed to compute cycle breakdown"
    );
  } else {
    poolCommitIds = poolCommitIdsResult.value;
    const ledgerEntriesResult = await getPoolLedgerEntries({
      metronomeCustomerId,
      poolCommitIds,
    });
    if (ledgerEntriesResult.isErr()) {
      logger.error(
        {
          metronomeCustomerId,
          metronomeContractId,
          error: ledgerEntriesResult.error,
        },
        "[AwuPoolSummary] Failed to fetch pool commit/credit ledgers"
      );
    } else {
      ledgerEntries = ledgerEntriesResult.value;
      cycleBreakdown = computeCycleBreakdown({
        finalizedInvoices: finalizedInvoicesResult.value,
        ledgerEntries,
        cycleHistoryLimit,
      });
    }
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

  const currentCycleConsumedCredits =
    currentInvoice && ledgerEntries
      ? sumPoolLedgerEntriesForInvoice(ledgerEntries, currentInvoice.id)
      : null;

  if (!currentInvoice?.start_timestamp || !currentInvoice.end_timestamp) {
    return new Ok({
      totalRemainingCredits: 0,
      totalActiveCredits: 0,
      overageCredits: null,
      overageAmountCents: null,
      overageCurrency: null,
      currentCycleStartMs: null,
      currentCycleEndMs: null,
      currentCycleConsumedCredits,
      cycleBreakdown,
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
  //
  // A pool grant under a superseded contract can still cover `now`,
  // so it must not be excluded.
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
      !seatProductIds.has(entry.product.id)
  );

  let totalRemainingCredits = 0;
  let totalActiveCredits = 0;
  for (const entry of awuBalances) {
    const scheduleItems = entry.access_schedule?.schedule_items ?? [];
    const hasActiveItem = scheduleItems.some((item) => {
      const itemStartMs = new Date(item.starting_at).getTime();
      const itemEndMs = new Date(item.ending_before).getTime();
      return itemStartMs <= now && now < itemEndMs;
    });
    if (hasActiveItem) {
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
    currentCycleStartMs,
    currentCycleEndMs,
    currentCycleConsumedCredits,
    cycleBreakdown,
  });
}
