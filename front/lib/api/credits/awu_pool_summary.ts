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

const CYCLE_HISTORY_LIMIT = 5;
// Fetched ahead of the target cycle count so cycles with zero pool
// consumption (e.g. an invoice with no pool-tagged usage line) still leave
// enough real cycles to fill `CYCLE_HISTORY_LIMIT`.
const FINALIZED_INVOICES_FETCH_LIMIT = 12;

// Pool consumption entries: each ledger entry already reflects the amount
// drawn down from a single, known commit/credit, so — unlike invoice line
// items — there's no `sub_line_items` split to reconstruct. Filtering to
// `poolCommitIds` and the automated-deduction entry types is enough.
const POOL_LEDGER_DEDUCTION_TYPES = new Set([
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

// Reads pool consumption straight off the pool commits'/credits' ledgers
// instead of reconstructing it from invoice line items. Each automated
// invoice-deduction ledger entry already carries the exact amount drawn from
// that single commit/credit plus the invoice it was billed on, so summing
// entries by `invoiceId` gives the same per-cycle consumption figure the
// invoice line-item parsing used to compute, without the `commit_id`/
// `sub_line_items` ambiguity that requires special-casing split usage lines.
//
// Fetched via `listMetronomeBalances` (`contracts.listBalances`), not
// `customers.commits.list`/`customers.credits.list`: Metronome's docs only
// guarantee "full transaction history" for `include_ledgers=true` on the
// former — the latter's `include_ledgers` isn't documented as complete, and
// in practice was observed silently returning only the most recent
// deduction entry for a commit that had two, dropping older cycles'
// consumption. Customer-wide (`coveringDate: null`, no contract filter,
// `includeArchived`), not scoped to the workspace's *current*
// `metronomeContractId` — a contract renewal/switch gives the workspace a
// new contract id, but pool credits/commits granted under a superseded
// contract are still real consumption history and must stay counted.
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
        !POOL_LEDGER_DEDUCTION_TYPES.has(item.type) ||
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

// Deduction ledger entries carry the *delta applied to balance* — negative,
// since a deduction reduces it — not a positive "amount consumed" the way
// invoice line-item `quantity` was. `Math.abs` turns that debit back into a
// consumption figure.
function sumPoolLedgerEntriesForInvoice(
  ledgerEntries: PoolLedgerEntry[],
  invoiceId: string
): number {
  return ledgerEntries
    .filter((entry) => entry.invoiceId === invoiceId)
    .reduce((sum, entry) => sum + Math.abs(entry.amountCredits), 0);
}

// The set of commit/credit ids backing the workspace's pool, across both
// currently active and past (expired/fully-consumed, or granted under a
// superseded contract) grants — invoices from 2-3 cycles ago can reference
// commits that are no longer active, or no longer on the workspace's
// *current* contract, today, hence `coveringDate: null` and no contract
// filter (see `getPoolLedgerEntries`).
async function getPoolCommitIds({
  metronomeCustomerId,
}: {
  metronomeCustomerId: string;
}): Promise<Result<Set<string>, Error>> {
  const poolBalancesResult = await listMetronomeBalances(metronomeCustomerId, {
    coveringDate: null,
    onlyPoolCredits: true,
    // Without this, an archived pool-tagged commit/credit (e.g. a
    // predecessor superseded by a rollover) is invisible here even though
    // `getPoolLedgerEntries` fetches archived sources too — its consumption
    // history would then be silently dropped for having an id that never
    // made it into `poolCommitIds`.
    includeArchived: true,
  });
  if (poolBalancesResult.isErr()) {
    return new Err(poolBalancesResult.error);
  }
  return new Ok(new Set(poolBalancesResult.value.map((entry) => entry.id)));
}

/**
 * Per-cycle pool consumption, over up to the last `CYCLE_HISTORY_LIMIT`
 * finalized invoices for this contract that had non-zero pool consumption.
 * `finalizedInvoices` only ever contains FINALIZED invoices (drafts are
 * fetched separately and never mixed in), and cycles with zero pool
 * consumption are skipped — a longer window is still searched
 * (`FINALIZED_INVOICES_FETCH_LIMIT`) so a couple of zero-usage cycles don't
 * starve the breakdown of real data points.
 */
function computeCycleBreakdown({
  finalizedInvoices,
  ledgerEntries,
}: {
  finalizedInvoices: Invoice[];
  ledgerEntries: PoolLedgerEntry[];
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
    .slice(0, CYCLE_HISTORY_LIMIT);
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

// The redesigned usage page and the Poke Pool Usage page both hide the whole
// "credit pool" block whenever `totalActiveCredits <= 0` (`hasPool`), and
// independently hide the "this cycle" figure and the cycle-history table
// whenever `currentCycleConsumedCredits`/`cycleBreakdown` come back
// null/empty. Logs *why*, verbosely, whenever that happens, so a report of
// "the numbers just aren't showing for this client" can be traced straight
// to the upstream cause (no active grant, no draft invoice, a Metronome
// fetch failure, no historical pool consumption, ...) via the `reasons`
// facet in Datadog instead of re-derived by hand from a fresh ledger dump
// every time.
function logHiddenCycleInfoIfNeeded({
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  hasActiveCurrentCycleInvoice,
  currentInvoiceId,
  poolCommitIdsOrFinalizedInvoicesFetchFailed,
  ledgerFetchFailed,
  ledgerEntriesCount,
  poolCommitIds,
  currentCycleConsumedCredits,
  cycleBreakdown,
  totalActiveCredits,
  totalRemainingCredits,
  latestCreditExpirationMs,
}: {
  workspaceId: string;
  metronomeCustomerId: string;
  metronomeContractId: string;
  hasActiveCurrentCycleInvoice: boolean;
  currentInvoiceId: string | null;
  poolCommitIdsOrFinalizedInvoicesFetchFailed: boolean;
  ledgerFetchFailed: boolean;
  ledgerEntriesCount: number | null;
  poolCommitIds: string[];
  currentCycleConsumedCredits: number | null;
  cycleBreakdown: AwuPoolCycleBreakdown[];
  totalActiveCredits: number;
  totalRemainingCredits: number;
  latestCreditExpirationMs: number | null;
}): void {
  const reasons: string[] = [];

  if (!hasActiveCurrentCycleInvoice) {
    reasons.push("no_active_current_cycle_draft_invoice");
  }
  if (totalActiveCredits <= 0) {
    reasons.push("pool_has_no_active_credits_hasPool_false");
  }
  if (currentCycleConsumedCredits === null) {
    reasons.push(
      ledgerFetchFailed
        ? "current_cycle_consumed_credits_null_ledger_fetch_failed"
        : poolCommitIdsOrFinalizedInvoicesFetchFailed
          ? "current_cycle_consumed_credits_null_pool_commit_ids_or_invoices_fetch_failed"
          : "current_cycle_consumed_credits_null_no_current_invoice"
    );
  }
  if (cycleBreakdown.length === 0) {
    reasons.push(
      ledgerFetchFailed
        ? "cycle_breakdown_empty_ledger_fetch_failed"
        : poolCommitIdsOrFinalizedInvoicesFetchFailed
          ? "cycle_breakdown_empty_pool_commit_ids_or_invoices_fetch_failed"
          : "cycle_breakdown_empty_no_historical_pool_consumption"
    );
  }

  if (reasons.length === 0) {
    return;
  }

  logger.warn(
    {
      workspaceId,
      metronomeCustomerId,
      metronomeContractId,
      reasons,
      currentInvoiceId,
      hasActiveCurrentCycleInvoice,
      poolCommitIds,
      poolCommitIdsOrFinalizedInvoicesFetchFailed,
      ledgerFetchFailed,
      ledgerEntriesCount,
      currentCycleConsumedCredits,
      cycleBreakdown,
      totalActiveCredits,
      totalRemainingCredits,
      latestCreditExpirationMs,
    },
    "[AwuPoolSummary] Current-cycle/previous-cycle info hidden from the UI"
  );
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
      limit: FINALIZED_INVOICES_FETCH_LIMIT,
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

  // Best-effort: a failure here degrades the cycle-history table (no
  // breakdown) but shouldn't take down the rest of the pool summary.
  let poolCommitIds = new Set<string>();
  // `null` means the ledger couldn't be read (fetch failure), as opposed to
  // an empty array of entries (no consumption yet) — kept distinct so
  // `currentCycleConsumedCredits` degrades to `null` rather than reading as
  // a real zero.
  let ledgerEntries: PoolLedgerEntry[] | null = null;
  let cycleBreakdown: AwuPoolCycleBreakdown[] = [];
  // Tracked separately from the `logger.error` calls below so the
  // hidden-cycle-info diagnostic further down can report *why* the figures
  // ended up null/empty without re-deriving it from the (by-then-discarded)
  // Result values.
  let poolCommitIdsOrFinalizedInvoicesFetchFailed = false;
  let ledgerFetchFailed = false;
  if (poolCommitIdsResult.isErr() || finalizedInvoicesResult.isErr()) {
    poolCommitIdsOrFinalizedInvoicesFetchFailed = true;
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
      ledgerFetchFailed = true;
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

  // Elapsed pool consumption for the in-progress cycle: the pool commits'/
  // credits' ledgers already carry an automated-deduction entry against the
  // draft invoice as usage accrues, so this reads the same live figure the
  // draft invoice's line items used to be parsed for — without the
  // sub_line_items reconstruction.
  const currentCycleConsumedCredits =
    currentInvoice && ledgerEntries
      ? sumPoolLedgerEntriesForInvoice(ledgerEntries, currentInvoice.id)
      : null;

  if (!currentInvoice?.start_timestamp || !currentInvoice.end_timestamp) {
    logHiddenCycleInfoIfNeeded({
      workspaceId: workspace.sId,
      metronomeCustomerId,
      metronomeContractId,
      hasActiveCurrentCycleInvoice: false,
      currentInvoiceId: currentInvoice?.id ?? null,
      poolCommitIdsOrFinalizedInvoicesFetchFailed,
      ledgerFetchFailed,
      ledgerEntriesCount: ledgerEntries?.length ?? null,
      poolCommitIds: Array.from(poolCommitIds),
      currentCycleConsumedCredits,
      cycleBreakdown,
      totalActiveCredits: 0,
      totalRemainingCredits: 0,
      latestCreditExpirationMs: null,
    });
    return new Ok({
      totalRemainingCredits: 0,
      totalActiveCredits: 0,
      overageCredits: null,
      overageAmountCents: null,
      overageCurrency: null,
      currentCycleStartMs: null,
      currentCycleEndMs: null,
      latestCreditExpirationMs: null,
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
  // Not scoped to the workspace's *current* `metronomeContractId`, same as
  // `getPoolLedgerEntries`/`getPoolCommitIds` above — a contract renewal
  // gives the workspace a new contract id, but a pool grant issued under a
  // superseded contract can still be the one actively covering `now`, and
  // excluding it would incorrectly report the pool as exhausted (hasPool
  // false) despite it holding a real, spendable balance. `onlyPoolCredits`
  // (default on `listMetronomeBalances`) already restricts this to
  // DUST_CONTRACT_CREDIT_TYPE=pool-tagged balances, so this isn't at risk of
  // picking up unrelated sandbox contracts' balances.
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

  logHiddenCycleInfoIfNeeded({
    workspaceId: workspace.sId,
    metronomeCustomerId,
    metronomeContractId,
    hasActiveCurrentCycleInvoice: true,
    currentInvoiceId: currentInvoice.id,
    poolCommitIdsOrFinalizedInvoicesFetchFailed,
    ledgerFetchFailed,
    ledgerEntriesCount: ledgerEntries?.length ?? null,
    poolCommitIds: Array.from(poolCommitIds),
    currentCycleConsumedCredits,
    cycleBreakdown,
    totalActiveCredits,
    totalRemainingCredits,
    latestCreditExpirationMs,
  });

  return new Ok({
    totalRemainingCredits,
    totalActiveCredits,
    overageCredits,
    overageAmountCents,
    overageCurrency: overageCredits !== null ? overageCurrency : null,
    currentCycleStartMs,
    currentCycleEndMs,
    latestCreditExpirationMs,
    currentCycleConsumedCredits,
    cycleBreakdown,
  });
}
