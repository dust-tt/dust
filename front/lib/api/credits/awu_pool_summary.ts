import {
  getEsConsumedAwuCreditsForWorkspace,
  resolveMetronomeCycle,
  sumActiveMembersPoolConsumedCredits,
} from "@app/lib/api/credits/members_usage";
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
  USAGE_TYPE_GROUP_KEY,
  USAGE_TYPE_PROGRAMMATIC,
} from "@app/lib/metronome/constants";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { fetchProgrammaticAwuSpend } from "@app/lib/metronome/programmatic_awu_usage";
import {
  getProductSeatTypes,
  getSeatTypesByProductIdFromContract,
} from "@app/lib/metronome/seat_types";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type {
  AwuPoolCurrentCycleResponseBody,
  AwuPoolCycleBreakdown,
  AwuPoolCycleHistoryResponseBody,
  AwuPoolSummaryResponseBody,
} from "@app/types/api/credits/awu_pool_summary";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { isNumber } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
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

type PoolLedgerData = {
  poolCommitIds: Set<string>;
  ledgerEntries: PoolLedgerEntry[];
};

const APPROX_CYCLE_LENGTH_DAYS = 31;

// Balance listing bounded to the history the caller can actually surface
async function getPoolLedgerData({
  metronomeCustomerId,
  cycleHistoryLimit,
}: {
  metronomeCustomerId: string;
  cycleHistoryLimit: number;
}): Promise<Result<PoolLedgerData, Error>> {
  const startingAt = new Date(
    Date.now() - cycleHistoryLimit * APPROX_CYCLE_LENGTH_DAYS * ONE_DAY_MS
  );
  const balancesResult = await listMetronomeBalances(metronomeCustomerId, {
    coveringDate: null,
    onlyPoolCredits: true,
    includeArchived: true,
    includeLedgers: true,
    startingAt,
  });
  if (balancesResult.isErr()) {
    return new Err(balancesResult.error);
  }

  const poolCommitIds = new Set<string>();
  const ledgerEntries: PoolLedgerEntry[] = [];
  for (const source of balancesResult.value) {
    poolCommitIds.add(source.id);
    for (const item of source.ledger ?? []) {
      if (
        !AUTOMATED_INVOICE_DEDUCTION_LEDGER_TYPES.has(item.type) ||
        !("invoice_id" in item)
      ) {
        continue;
      }
      ledgerEntries.push({
        sourceId: source.id,
        invoiceId: item.invoice_id,
        amountCredits: item.amount,
        timestampMs: new Date(item.timestamp).getTime(),
      });
    }
  }
  return new Ok({ poolCommitIds, ledgerEntries });
}

function sumPoolLedgerEntriesForInvoice(
  ledgerEntries: PoolLedgerEntry[],
  invoiceId: string
): number {
  return ledgerEntries
    .filter((entry) => entry.invoiceId === invoiceId)
    .reduce((sum, entry) => sum + Math.abs(entry.amountCredits), 0);
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

type MetronomeContext = {
  workspace: LightWorkspaceType;
  metronomeCustomerId: string;
  metronomeContractId: string;
};

function resolveMetronomeContext(
  auth: Authenticator
): Result<MetronomeContext, AwuPoolSummaryError> {
  const workspace = auth.getNonNullableWorkspace();
  const subscription = auth.subscription();
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId || !subscription?.metronomeContractId) {
    return new Err(new AwuPoolSummaryError("not_configured"));
  }
  return new Ok({
    workspace,
    metronomeCustomerId,
    metronomeContractId: subscription.metronomeContractId,
  });
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

// PAYG overage on credit-priced contracts shows up as a `cpu_conversion`
function extractOverageFromInvoice(invoice: Invoice): {
  overageCredits: number | null;
  overageAmountCents: number | null;
  overageCurrency: SupportedCurrency | null;
} {
  const overageCurrency = creditTypeIdToCurrency(invoice.credit_type.id);
  if (!overageCurrency) {
    return {
      overageCredits: null,
      overageAmountCents: null,
      overageCurrency: null,
    };
  }
  let overageCredits: number | null = null;
  let overageAmountCents: number | null = null;
  for (const item of invoice.line_items) {
    if (item.type !== "cpu_conversion") {
      continue;
    }
    if (isNumber(item.quantity)) {
      overageCredits = (overageCredits ?? 0) + item.quantity;
    }
    overageAmountCents =
      (overageAmountCents ?? 0) + amountCents(item.total, overageCurrency);
  }
  return {
    overageCredits,
    overageAmountCents,
    overageCurrency: overageCredits !== null ? overageCurrency : null,
  };
}

// Fallback cycle history for workspaces with no credit pool
function computeExcessCycleBreakdown(
  finalizedInvoices: Invoice[],
  cycleHistoryLimit: number
): AwuPoolCycleBreakdown[] {
  return finalizedInvoices
    .map((invoice) => ({
      cycleStartMs: invoice.start_timestamp
        ? new Date(invoice.start_timestamp).getTime()
        : null,
      cycleEndMs: invoice.end_timestamp
        ? new Date(invoice.end_timestamp).getTime()
        : null,
      consumedCredits: extractOverageFromInvoice(invoice).overageCredits ?? 0,
    }))
    .filter((cycle) => cycle.consumedCredits > 0)
    .slice(0, cycleHistoryLimit);
}

// Programmatic AWU spend against the pool, read straight from the current
// draft invoice's own usage line items
function sumProgrammaticPoolConsumedFromInvoice({
  invoice,
  poolCommitIds,
  awuCreditTypeId,
}: {
  invoice: Invoice;
  poolCommitIds: Set<string>;
  awuCreditTypeId: string;
}): number {
  return invoice.line_items
    .filter(
      (item) =>
        item.type === "usage" &&
        item.commit_id != null &&
        poolCommitIds.has(item.commit_id) &&
        item.credit_type.id === awuCreditTypeId &&
        item.pricing_group_values?.[USAGE_TYPE_GROUP_KEY] ===
          USAGE_TYPE_PROGRAMMATIC
    )
    .reduce((sum, item) => sum + item.total, 0);
}

// Read live from Metronome
async function fetchProgrammaticConsumedCreditsOrNull({
  workspace,
  metronomeCustomerId,
}: {
  workspace: LightWorkspaceType;
  metronomeCustomerId: string;
}): Promise<number | null> {
  const result = await fetchProgrammaticAwuSpend({
    workspaceId: workspace.sId,
    metronomeCustomerId,
  });
  if (result.isErr()) {
    logger.warn(
      { workspaceId: workspace.sId, error: result.error },
      "[AwuPoolSummary] Failed to fetch programmatic AWU spend from Metronome"
    );
    return null;
  }
  return result.value;
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

type AwuPoolSummaryErrorType = AwuPoolSummaryError["type"];

type SerializableAwuPoolCurrentCycleOutcome =
  | { status: "ok"; body: AwuPoolCurrentCycleResponseBody }
  | { status: "error"; errorType: AwuPoolSummaryErrorType };

async function computeAwuPoolCurrentCycleOutcome(
  auth: Authenticator
): Promise<SerializableAwuPoolCurrentCycleOutcome> {
  const result = await getAwuPoolCurrentCycleUncached(auth);
  if (result.isErr()) {
    return { status: "error", errorType: result.error.type };
  }
  return { status: "ok", body: result.value };
}

const AWU_POOL_CURRENT_CYCLE_CACHE_ID = "awuPoolCurrentCycle";
const AWU_POOL_CURRENT_CYCLE_CACHE_TTL_MS = 60 * 1000;

const getCachedAwuPoolCurrentCycleOutcome = cacheWithRedis(
  computeAwuPoolCurrentCycleOutcome,
  (auth) => auth.getNonNullableWorkspace().sId,
  {
    cacheId: AWU_POOL_CURRENT_CYCLE_CACHE_ID,
    ttlMs: AWU_POOL_CURRENT_CYCLE_CACHE_TTL_MS,
  }
);

export async function getAwuPoolCurrentCycle(
  auth: Authenticator
): Promise<Result<AwuPoolCurrentCycleResponseBody, AwuPoolSummaryError>> {
  const outcome = await getCachedAwuPoolCurrentCycleOutcome(auth);
  if (outcome.status === "error") {
    return new Err(new AwuPoolSummaryError(outcome.errorType));
  }
  return new Ok(outcome.body);
}

type SerializableAwuPoolCycleHistoryOutcome =
  | { status: "ok"; body: AwuPoolCycleHistoryResponseBody }
  | { status: "error"; errorType: AwuPoolSummaryErrorType };

async function computeAwuPoolCycleHistoryOutcome(
  auth: Authenticator,
  cycleHistoryLimit: number
): Promise<SerializableAwuPoolCycleHistoryOutcome> {
  const result = await getAwuPoolCycleHistoryUncached(auth, {
    cycleHistoryLimit,
  });
  if (result.isErr()) {
    return { status: "error", errorType: result.error.type };
  }
  return { status: "ok", body: result.value };
}

function cacheResolverKeyWithHistoryLimit(
  workspaceId: string,
  cycleHistoryLimit: number
): string {
  return `${workspaceId}-${cycleHistoryLimit}`;
}

const AWU_POOL_CYCLE_HISTORY_CACHE_ID = "awuPoolCycleHistory";
const AWU_POOL_CYCLE_HISTORY_CACHE_TTL_MS = 60 * 1000;

const getCachedAwuPoolCycleHistoryOutcome = cacheWithRedis(
  computeAwuPoolCycleHistoryOutcome,
  (auth, cycleHistoryLimit) =>
    cacheResolverKeyWithHistoryLimit(
      auth.getNonNullableWorkspace().sId,
      cycleHistoryLimit
    ),
  {
    cacheId: AWU_POOL_CYCLE_HISTORY_CACHE_ID,
    ttlMs: AWU_POOL_CYCLE_HISTORY_CACHE_TTL_MS,
  }
);

export async function getAwuPoolCycleHistory(
  auth: Authenticator,
  {
    cycleHistoryLimit = DEFAULT_CYCLE_HISTORY_LIMIT,
  }: {
    cycleHistoryLimit?: number;
  } = {}
): Promise<Result<AwuPoolCycleHistoryResponseBody, AwuPoolSummaryError>> {
  const outcome = await getCachedAwuPoolCycleHistoryOutcome(
    auth,
    cycleHistoryLimit
  );
  if (outcome.status === "error") {
    return new Err(new AwuPoolSummaryError(outcome.errorType));
  }
  return new Ok(outcome.body);
}

async function getAwuPoolCycleHistoryUncached(
  auth: Authenticator,
  { cycleHistoryLimit }: { cycleHistoryLimit: number }
): Promise<Result<AwuPoolCycleHistoryResponseBody, AwuPoolSummaryError>> {
  const contextResult = resolveMetronomeContext(auth);
  if (contextResult.isErr()) {
    return contextResult;
  }
  const { metronomeCustomerId, metronomeContractId } = contextResult.value;

  const [poolLedgerDataResult, finalizedInvoicesResult] = await Promise.all([
    getPoolLedgerData({ metronomeCustomerId, cycleHistoryLimit }),
    listMetronomeFinalizedInvoices(metronomeCustomerId, {
      limit: cycleHistoryLimit,
    }),
  ]);

  if (poolLedgerDataResult.isErr() || finalizedInvoicesResult.isErr()) {
    logger.error(
      {
        metronomeCustomerId,
        metronomeContractId,
        poolLedgerDataError: poolLedgerDataResult.isErr()
          ? poolLedgerDataResult.error
          : null,
        invoicesError: finalizedInvoicesResult.isErr()
          ? finalizedInvoicesResult.error
          : null,
      },
      "[AwuPoolSummary] Failed to compute cycle breakdown"
    );
    return new Ok({ cycleBreakdown: [], excessCycleBreakdown: [] });
  }

  const cycleBreakdown = computeCycleBreakdown({
    finalizedInvoices: finalizedInvoicesResult.value,
    ledgerEntries: poolLedgerDataResult.value.ledgerEntries,
    cycleHistoryLimit,
  });
  const excessCycleBreakdown = computeExcessCycleBreakdown(
    finalizedInvoicesResult.value,
    cycleHistoryLimit
  );

  return new Ok({ cycleBreakdown, excessCycleBreakdown });
}

export async function getAwuPoolSummary(
  auth: Authenticator,
  {
    cycleHistoryLimit = DEFAULT_CYCLE_HISTORY_LIMIT,
  }: {
    cycleHistoryLimit?: number;
  } = {}
): Promise<Result<AwuPoolSummaryResponseBody, AwuPoolSummaryError>> {
  const [currentCycleResult, cycleHistoryResult] = await Promise.all([
    getAwuPoolCurrentCycle(auth),
    getAwuPoolCycleHistory(auth, { cycleHistoryLimit }),
  ]);
  if (currentCycleResult.isErr()) {
    return currentCycleResult;
  }
  if (cycleHistoryResult.isErr()) {
    return cycleHistoryResult;
  }
  return new Ok({
    ...currentCycleResult.value,
    ...cycleHistoryResult.value,
  });
}

async function getAwuPoolCurrentCycleUncached(
  auth: Authenticator
): Promise<Result<AwuPoolCurrentCycleResponseBody, AwuPoolSummaryError>> {
  const contextResult = resolveMetronomeContext(auth);
  if (contextResult.isErr()) {
    return contextResult;
  }
  const { workspace, metronomeCustomerId, metronomeContractId } =
    contextResult.value;
  const awuCreditTypeId = getCreditTypeAwuId();

  const [
    balancesResult,
    invoicesResult,
    poolLedgerDataResult,
    membersPoolConsumedCredits,
  ] = await Promise.all([
    listMetronomeBalances(metronomeCustomerId),
    listMetronomeDraftInvoices(metronomeCustomerId),
    getPoolLedgerData({ metronomeCustomerId, cycleHistoryLimit: 1 }),
    sumActiveMembersPoolConsumedCredits({
      auth,
      metronomeCustomerId,
      metronomeContractId,
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
  if (poolLedgerDataResult.isErr()) {
    logger.error(
      {
        metronomeCustomerId,
        metronomeContractId,
        error: poolLedgerDataResult.error,
      },
      "[AwuPoolSummary] Failed to read pool ledger for the current cycle"
    );
  } else {
    poolCommitIds = poolLedgerDataResult.value.poolCommitIds;
    ledgerEntries = poolLedgerDataResult.value.ledgerEntries;
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
    const fallbackCycle = await resolveMetronomeCycle(workspace);
    const excessConsumedCredits = fallbackCycle
      ? await getEsConsumedAwuCreditsForWorkspace(workspace, {
          cycle: fallbackCycle,
        })
      : null;
    const programmaticConsumedCredits =
      await fetchProgrammaticConsumedCreditsOrNull({
        workspace,
        metronomeCustomerId,
      });
    return new Ok({
      totalRemainingCredits: 0,
      totalActiveCredits: 0,
      overageCredits: null,
      overageAmountCents: null,
      overageCurrency: null,
      currentCycleStartMs: null,
      currentCycleEndMs: null,
      currentCycleConsumedCredits,
      excessConsumedCredits,
      programmaticConsumedCredits,
      otherConsumedCredits: null,
    });
  }

  const currentCycleStartMs = new Date(
    currentInvoice.start_timestamp
  ).getTime();
  const currentCycleEndMs = new Date(currentInvoice.end_timestamp).getTime();

  const { overageCredits, overageAmountCents, overageCurrency } =
    extractOverageFromInvoice(currentInvoice);

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
    }
  }

  const excessConsumedCredits =
    totalActiveCredits <= 0
      ? await getEsConsumedAwuCreditsForWorkspace(workspace, {
          cycle: {
            cycleStart: new Date(currentCycleStartMs),
            cycleEnd: new Date(currentCycleEndMs),
          },
        })
      : null;

  const programmaticConsumedCredits = poolLedgerDataResult.isErr()
    ? null
    : sumProgrammaticPoolConsumedFromInvoice({
        invoice: currentInvoice,
        poolCommitIds,
        awuCreditTypeId,
      });

  const otherConsumedCredits =
    currentCycleConsumedCredits !== null &&
    programmaticConsumedCredits !== null &&
    membersPoolConsumedCredits !== null
      ? Math.max(
          0,
          currentCycleConsumedCredits -
            programmaticConsumedCredits -
            membersPoolConsumedCredits
        )
      : null;

  return new Ok({
    totalRemainingCredits,
    totalActiveCredits,
    overageCredits,
    overageAmountCents,
    overageCurrency: overageCredits !== null ? overageCurrency : null,
    currentCycleStartMs,
    currentCycleEndMs,
    currentCycleConsumedCredits,
    excessConsumedCredits,
    programmaticConsumedCredits,
    otherConsumedCredits,
  });
}
