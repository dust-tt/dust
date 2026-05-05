import {
  ceilToHourISO,
  createMetronomeContract,
  createMetronomeCustomer,
  ensureMetronomeStripeBillingConfig,
  findMetronomeCustomerByAlias,
  floorToHourISO,
  getMetronomeClient,
  getMetronomeContractById,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  CURRENCY_TO_CREDIT_TYPE_ID,
  getProductMauCommitId,
  getProductMauId,
  getProductMauTierIds,
  MAX_MAU_TIERS,
} from "@app/lib/metronome/constants";
import {
  computeTierQuantity,
  hasMauSubscriptionInContract,
  parseMauTiers,
  syncMauCount,
} from "@app/lib/metronome/mau_sync";
import {
  getSeatSubscriptionIdFromContract,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import { LEGACY_ENTERPRISE_PACKAGE_ALIAS } from "@app/lib/metronome/types";
import { resolvePackageAliasForCurrency } from "@app/lib/plans/billing_currency";
import { getStripeClient } from "@app/lib/plans/stripe";
import { countActiveUsersForPeriodInWorkspace } from "@app/lib/plans/usage/mau";
import {
  isEnterpriseReportUsage,
  type SupportedEnterpriseReportUsage,
} from "@app/lib/plans/usage/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type Stripe from "stripe";
import { metronomeAmount } from "./amounts";

/**
 * Switch a Metronome contract to a different package (end old + create new).
 * Customer must already exist.
 */
export async function switchMetronomeContractPackage({
  metronomeCustomerId,
  oldContractId,
  workspace,
  packageAlias,
  enableStripeBilling,
}: {
  metronomeCustomerId: string;
  oldContractId: string;
  workspace: LightWorkspaceType;
  packageAlias: string;
  enableStripeBilling: boolean;
}): Promise<Result<{ metronomeContractId: string }, Error>> {
  // Round up to the next hour boundary (Metronome requires hour-aligned dates)
  // so the new contract starts exactly when the old one ends.
  const switchAt = new Date(ceilToHourISO(new Date()));

  const endResult = await scheduleMetronomeContractEnd({
    metronomeCustomerId,
    contractId: oldContractId,
    endingBefore: switchAt,
  });
  if (endResult.isErr()) {
    return new Err(endResult.error);
  }

  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    startingAt: switchAt,
    enableStripeBilling,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const { contractId: metronomeContractId } = contractResult.value;
  const syncResult = await syncContractQuantities(
    metronomeCustomerId,
    metronomeContractId,
    workspace,
    switchAt.toISOString()
  );
  if (syncResult.isErr()) {
    return new Err(syncResult.error);
  }

  return new Ok({ metronomeContractId });
}

/**
 * Idempotently ensure a Metronome customer exists for a workspace and that
 * its id is persisted on the workspace row.
 *
 * - If `workspace.metronomeCustomerId` is already set, returns it.
 * - Otherwise looks the customer up on Metronome by ingest alias (workspace
 *   sId), creating it if missing, then writes the id back to the workspace.
 *
 * `stripeCustomerId` is optional — when omitted the Metronome customer is
 * created without a Stripe billing-provider configuration. This is the path
 * used for free-plan workspaces that may later receive credits via Poke
 * before they ever subscribe to a paid plan.
 */
export async function ensureMetronomeCustomerForWorkspace({
  workspace,
  stripeCustomerId,
}: {
  workspace: LightWorkspaceType;
  stripeCustomerId?: string;
}): Promise<Result<{ metronomeCustomerId: string }, Error>> {
  let metronomeCustomerId: string | null = workspace.metronomeCustomerId;

  if (!metronomeCustomerId) {
    const findResult = await findMetronomeCustomerByAlias(workspace.sId);
    if (findResult.isOk()) {
      metronomeCustomerId = findResult.value;
    }
  }

  if (!metronomeCustomerId) {
    const createResult = await createMetronomeCustomer({
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      stripeCustomerId,
    });
    if (createResult.isErr()) {
      return new Err(createResult.error);
    }
    metronomeCustomerId = createResult.value.metronomeCustomerId;
  }

  if (workspace.metronomeCustomerId !== metronomeCustomerId) {
    const updateResult = await WorkspaceResource.updateMetronomeCustomerId(
      workspace.id,
      metronomeCustomerId
    );
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }
    await WorkspaceResource.invalidateCache(workspace.sId);
  }

  // If a Stripe customer is provided, make sure the Metronome customer has a
  // Stripe billing configuration. This covers the upgrade case where the
  // workspace was provisioned in Metronome without a Stripe link (free plan)
  // and later acquired a Stripe customer.
  if (stripeCustomerId) {
    const billingResult = await ensureMetronomeStripeBillingConfig({
      metronomeCustomerId,
      stripeCustomerId,
    });
    if (billingResult.isErr()) {
      return new Err(billingResult.error);
    }
  }

  return new Ok({ metronomeCustomerId });
}

/**
 * Provision a Metronome contract on an already-existing Metronome customer.
 * Creates the contract from the given package alias, then syncs seat / MAU
 * subscription quantities seeded by the package.
 *
 * The Metronome customer must already exist (call
 * `ensureMetronomeCustomerForWorkspace` first).
 */
export async function provisionMetronomeContract({
  metronomeCustomerId,
  workspace,
  packageAlias,
  uniquenessKey,
  startingAt,
  enableStripeBilling = true,
}: {
  metronomeCustomerId: string;
  workspace: LightWorkspaceType;
  packageAlias: string;
  uniquenessKey: string;
  // Must already be on an hour boundary (Metronome requirement).
  startingAt: Date;
  enableStripeBilling?: boolean;
}): Promise<Result<{ metronomeContractId: string }, Error>> {
  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    uniquenessKey,
    startingAt,
    enableStripeBilling,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const { contractId: metronomeContractId } = contractResult.value;
  const syncResult = await syncContractQuantities(
    metronomeCustomerId,
    metronomeContractId,
    workspace,
    startingAt.toISOString()
  );
  if (syncResult.isErr()) {
    return new Err(syncResult.error);
  }

  return new Ok({ metronomeContractId });
}

// ---------------------------------------------------------------------------
// Enterprise contract provisioning from Stripe pricing
// ---------------------------------------------------------------------------

/** A single pricing tier extracted from Stripe's graduated tiered price. */
export interface StripeTierCents {
  /** Max units in this tier (undefined = unlimited / last tier). */
  upTo: number | undefined;
  /** Per-unit price in cents. */
  unitAmountCents: number;
  /** Flat amount in cents (typically only on the first tier as a floor). */
  flatAmountCents: number;
}

/**
 * Enterprise pricing extracted from a Stripe subscription.
 *
 * For MAU-based plans: graduated tiered pricing with optional floor.
 * For FIXED plans: flat monthly price, no MAU counting.
 */
export interface EnterprisePricingCents {
  /** Currency of the Stripe price (e.g. "usd", "eur"). */
  currency: SupportedCurrency;
  /** Billing mode: MAU_1/5/10 for MAU-based, FIXED for flat price. */
  billingMode: SupportedEnterpriseReportUsage;
  /** All pricing tiers from Stripe (empty for FIXED). */
  tiers: StripeTierCents[];
  /** Monthly floor amount in cents (flat_amount on first tier, or unit_amount for FIXED). */
  floorCents: number;
}

/**
 * One pricing phase of an enterprise contract.
 *
 * Stripe Subscription Schedules split a subscription's lifetime into phases,
 * each with its own pricing and date range. We mirror that on the Metronome
 * side by emitting time-bounded rate overrides (and a recurring commit per
 * phase if the floor amount changes).
 *
 * `endDate` is omitted on the final phase to keep the override open-ended —
 * matching Stripe's default `end_behavior: "release"` where the last phase's
 * pricing carries forward indefinitely.
 */
export interface EnterprisePricingPhase {
  pricing: EnterprisePricingCents;
  startDate: string;
  endDate?: string;
}

export async function syncContractQuantities(
  metronomeCustomerId: string,
  metronomeContractId: string,
  workspace: LightWorkspaceType,
  startingAt: string
): Promise<Result<void, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const contract = contractResult.value;

  const seatSubscriptionId = getSeatSubscriptionIdFromContract(contract);
  const shouldSyncSeats = seatSubscriptionId !== undefined;
  const shouldSyncMau = hasMauSubscriptionInContract(contract);

  const syncFns = [
    ...(shouldSyncSeats
      ? [
          () =>
            syncSeatCount({
              metronomeCustomerId,
              contractId: metronomeContractId,
              workspace,
              startingAt,
              contract,
            }),
        ]
      : []),
    ...(shouldSyncMau
      ? [
          () =>
            syncMauCount({
              metronomeCustomerId,
              contractId: metronomeContractId,
              workspace,
              startingAt,
              contract,
            }),
        ]
      : []),
  ];
  const results = await concurrentExecutor(syncFns, (fn) => fn(), {
    concurrency: 2,
  });

  for (const result of results) {
    if (result.isErr()) {
      return new Err(result.error);
    }
  }

  return new Ok(undefined);
}

/** Extract the MAU threshold number from a billing mode (MAU_1→1, MAU_5→5, MAU_10→10). */
function billingModeToMauThreshold(
  billingMode: SupportedEnterpriseReportUsage
): number {
  switch (billingMode) {
    case "MAU_5":
      return 5;
    case "MAU_10":
      return 10;
    default:
      return 1;
  }
}

/** Count MAUs for a workspace using the given billing mode's threshold. */
export async function countMauForWorkspace(
  workspace: LightWorkspaceType,
  billingMode: SupportedEnterpriseReportUsage
): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const count = await countActiveUsersForPeriodInWorkspace({
    messagesPerMonthForMau: billingModeToMauThreshold(billingMode),
    since: thirtyDaysAgo,
    workspace,
  });
  return Math.max(count, 1);
}

/**
 * A normalized view of a Stripe pricing item — the fields we actually need to
 * decide whether the item carries enterprise pricing and to extract it.
 *
 * Expressed this way so we can build it from both `Stripe.SubscriptionItem`
 * (where `price` is already a full object) and `SubscriptionSchedule.Phase.Item`
 * (where `price` is typically a string ID and we need to retrieve it first).
 */
interface EnterprisePricingItem {
  priceId: string;
  metadata: Stripe.Metadata | null | undefined;
  currency: string;
  unitAmountCents: number | null;
}

/**
 * Extract enterprise pricing from a normalized list of items.
 *
 * Walks the items, returning the first one tagged with an enterprise
 * `REPORT_USAGE` metadata. Tiers are fetched via `expand: ["tiers"]` since
 * neither Subscription items nor Schedule phase items include them by default.
 *
 * Supports two enterprise billing modes:
 * - MAU-based (REPORT_USAGE=MAU_1/5/10): metered, tiered price with floor + per-MAU overage.
 *   Tier 1: up_to=N, flat_amount=floor, unit_amount=0 (included seats)
 *   Tier 2: up_to=inf, unit_amount=per_mau_price (overage)
 * - FIXED (REPORT_USAGE=FIXED): licensed, flat monthly price, no MAU counting.
 *
 * Returns undefined if no enterprise pricing item is found.
 */
async function extractEnterprisePricingFromItems(
  items: EnterprisePricingItem[],
  pricingLogger: Logger
): Promise<EnterprisePricingCents | undefined> {
  const stripe = getStripeClient();

  for (const item of items) {
    const reportUsage = item.metadata?.REPORT_USAGE;
    if (!isEnterpriseReportUsage(reportUsage)) {
      continue;
    }

    if (!isSupportedCurrency(item.currency)) {
      pricingLogger.warn(
        { priceId: item.priceId, currency: item.currency },
        "Unsupported enterprise price currency"
      );
      return undefined;
    }

    // FIXED pricing: flat monthly fee, no MAU.
    if (reportUsage === "FIXED") {
      return {
        currency: item.currency,
        billingMode: reportUsage,
        tiers: [],
        floorCents: item.unitAmountCents ?? 0,
      };
    }

    // MAU-based pricing: graduated tiered price.
    // Stripe doesn't include tiers in the subscription / phase item by default.
    const price = await stripe.prices.retrieve(item.priceId, {
      expand: ["tiers"],
    });

    if (!isSupportedCurrency(price.currency)) {
      pricingLogger.warn(
        { priceId: price.id, currency: price.currency },
        "Unsupported enterprise price currency"
      );
      return undefined;
    }

    if (!price.tiers || price.tiers.length === 0) {
      pricingLogger.warn(
        { priceId: price.id, tiersCount: price.tiers?.length },
        "Enterprise price missing tiers"
      );
      return undefined;
    }

    // Single tier (e.g. [{unit: 2000, up_to: null}]) = flat per-MAU rate.
    if (price.tiers.length === 1) {
      const tier = price.tiers[0];
      return {
        currency: price.currency,
        billingMode: reportUsage,
        tiers: [
          {
            upTo: undefined,
            unitAmountCents: tier.unit_amount ?? 0,
            flatAmountCents: 0,
          },
        ],
        floorCents: 0,
      };
    }

    const tiers: StripeTierCents[] = price.tiers.map((t) => ({
      upTo: t.up_to ?? undefined,
      unitAmountCents: t.unit_amount ?? 0,
      flatAmountCents: t.flat_amount ?? 0,
    }));

    return {
      currency: price.currency,
      billingMode: reportUsage,
      tiers,
      floorCents: tiers[0].flatAmountCents,
    };
  }

  return undefined;
}

/**
 * Extract enterprise pricing from the *current* items of a Stripe subscription.
 *
 * This ignores SubscriptionSchedule phases — use `extractEnterprisePricingPhases`
 * when you need pricing across the full lifetime of a scheduled subscription.
 */
export async function extractEnterprisePricing(
  stripeSubscription: Stripe.Subscription,
  pricingLogger: Logger
): Promise<EnterprisePricingCents | undefined> {
  return extractEnterprisePricingFromItems(
    stripeSubscription.items.data.map((item) => ({
      priceId: item.price.id,
      metadata: item.price.metadata,
      currency: item.price.currency,
      unitAmountCents: item.price.unit_amount,
    })),
    pricingLogger
  );
}

/**
 * Resolve a `SubscriptionSchedule.Phase.Item` (where `price` is typically a
 * string ID) into our normalized item shape, fetching the price if needed.
 */
async function normalizePhaseItem(
  item: Stripe.SubscriptionSchedule.Phase.Item
): Promise<EnterprisePricingItem> {
  const stripe = getStripeClient();
  const priceId = typeof item.price === "string" ? item.price : item.price.id;
  // Always retrieve to get a non-deleted Price with metadata + currency +
  // unit_amount populated. Phase items are commonly returned unexpanded.
  const price = await stripe.prices.retrieve(priceId);
  return {
    priceId: price.id,
    metadata: price.metadata,
    currency: price.currency,
    unitAmountCents: price.unit_amount ?? null,
  };
}

/**
 * Extract enterprise pricing across all current and future phases of a Stripe
 * subscription.
 *
 * If the subscription is not part of a SubscriptionSchedule, returns a single
 * phase from the current items, anchored at `contractStartDate`.
 *
 * Otherwise fetches the schedule, drops phases that ended before
 * `contractStartDate`, and clamps the first kept phase's start to that date so
 * the resulting overrides line up with the new Metronome contract start. The
 * final phase has no `endDate` (open-ended override) — Stripe schedules
 * default to `end_behavior: "release"`, where the last phase's pricing carries
 * forward indefinitely.
 *
 * Returns an empty array if the subscription has no enterprise pricing.
 */
export async function extractEnterprisePricingPhases(
  stripeSubscription: Stripe.Subscription,
  contractStartDate: string,
  pricingLogger: Logger
): Promise<EnterprisePricingPhase[]> {
  const scheduleId =
    typeof stripeSubscription.schedule === "string"
      ? stripeSubscription.schedule
      : (stripeSubscription.schedule?.id ?? null);

  if (!scheduleId) {
    const pricing = await extractEnterprisePricing(
      stripeSubscription,
      pricingLogger
    );
    if (!pricing) {
      return [];
    }
    return [{ pricing, startDate: contractStartDate }];
  }

  const stripe = getStripeClient();
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);

  const contractStartMs = new Date(contractStartDate).getTime();
  const phases: EnterprisePricingPhase[] = [];

  for (let i = 0; i < schedule.phases.length; i++) {
    const phase = schedule.phases[i];
    const phaseEndMs = phase.end_date * 1000;
    const phaseStartMs = phase.start_date * 1000;

    // Drop phases that have already ended by the time the contract starts.
    if (phaseEndMs <= contractStartMs) {
      continue;
    }

    const normalizedItems: EnterprisePricingItem[] = [];
    for (const item of phase.items) {
      normalizedItems.push(await normalizePhaseItem(item));
    }
    const pricing = await extractEnterprisePricingFromItems(
      normalizedItems,
      pricingLogger
    );
    if (!pricing) {
      continue;
    }

    // Clamp the first kept phase to the contract start so the override doesn't
    // try to begin in the past.
    const startDate =
      phaseStartMs < contractStartMs
        ? contractStartDate
        : floorToHourISO(new Date(phaseStartMs));

    const isLastPhase = i === schedule.phases.length - 1;
    const endDate = isLastPhase
      ? undefined
      : ceilToHourISO(new Date(phaseEndMs));

    phases.push({ pricing, startDate, endDate });
  }

  return phases;
}

interface OverrideEntry {
  starting_at: string;
  ending_before?: string;
  type: "OVERWRITE";
  entitled: boolean;
  product_id?: string;
  override_specifiers?: Array<{
    product_id: string;
    billing_frequency: "MONTHLY";
  }>;
  overwrite_rate: {
    rate_type: "FLAT";
    price: number;
    credit_type_id?: string;
  };
}

interface SubscriptionEntry {
  collection_schedule: "ADVANCE";
  subscription_rate: {
    billing_frequency: "MONTHLY";
    product_id: string;
  };
  quantity_management_mode: "QUANTITY_ONLY";
  initial_quantity: number;
  proration: {
    is_prorated: boolean;
    invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE";
  };
}

interface RecurringCommitEntry {
  product_id: string;
  name: string;
  starting_at: string;
  ending_before?: string;
  rate_type: "LIST_RATE";
  priority: number;
  access_amount: {
    credit_type_id: string;
    unit_price: number;
    quantity: number;
  };
  invoice_amount: {
    credit_type_id: string;
    unit_price: number;
    quantity: number;
  };
  commit_duration: { value: number; unit: "PERIODS" };
  recurrence_frequency: "MONTHLY";
  applicable_product_ids: string[];
}

export interface EnterpriseOverridesPayload {
  overrides: OverrideEntry[];
  add_subscriptions?: SubscriptionEntry[];
  recurring_commits?: RecurringCommitEntry[];
  /** Custom fields to set on the contract (MAU_TIERS, MAU_THRESHOLD). */
  custom_fields?: Record<string, string>;
}

/**
 * Build the MAU_TIERS custom field value from Stripe tiers.
 *
 * Format: "FLOOR-{start2}-{start3}-..." if there's a floor (flat_amount > 0 on first tier),
 *         "{start1}-{start2}-..." otherwise.
 * Numbers are the start of each tier (up_to of previous tier + 1, or 0 for first).
 *
 * Examples:
 *   Stripe [{up_to:100, flat:3250}, {up_to:200}, {up_to:inf}] → "FLOOR-101-201"
 *   Stripe [{up_to:100, flat:0}, {up_to:inf}] → "1-101"
 *   Stripe [{up_to:inf}] → "1"
 */
function buildMauTiersField(tiers: StripeTierCents[]): string {
  if (tiers.length === 0) {
    return "1";
  }

  const hasFloor = tiers[0].flatAmountCents > 0;
  const parts: string[] = [];

  if (hasFloor) {
    parts.push("FLOOR");
  } else {
    parts.push("1");
  }

  // Add start of each subsequent tier (previous tier's up_to + 1).
  for (let i = 1; i < tiers.length; i++) {
    const prevUpTo = tiers[i - 1].upTo;
    if (prevUpTo !== undefined) {
      parts.push(String(prevUpTo + 1));
    }
  }

  return parts.join("-");
}

/**
 * Derive per-tier prices from Stripe tiers for Metronome FLAT rate overrides.
 *
 * Returns one price per tier in Metronome pricing units (cents for USD, euros for EUR).
 * - Floor tier: flat_amount / tier_size (so the commit covers exactly the included units)
 * - Other tiers: unit_amount directly from Stripe
 *
 * For EUR, converts to whole euros first, then divides — avoids precision loss
 * from rounding cents then dividing by 100.
 */
function deriveTierPrices(
  tiers: StripeTierCents[],
  currency: SupportedCurrency
): number[] {
  let previousUpTo = 0;
  return tiers.map((tier, index) => {
    const tierSize = tier.upTo ? tier.upTo - previousUpTo : undefined;
    previousUpTo = tier.upTo ?? previousUpTo;

    // First tier with floor: derive price from flat_amount / size.
    if (index === 0 && tier.flatAmountCents > 0 && tierSize) {
      // Convert floor to Metronome units first, then divide by tier size.
      const floorMetronome = metronomeAmount(tier.flatAmountCents, currency);
      return Math.round(floorMetronome / tierSize);
    }
    return metronomeAmount(tier.unitAmountCents, currency);
  });
}

/**
 * Determine whether a phase uses "simple mode" (single MAU product with a
 * uniform per-MAU rate) versus "tiered mode" (one MAU Tier product per Stripe
 * tier). Simple mode kicks in when all derived per-tier prices collapse to a
 * single value — the floor (if any) is still handled by a recurring commit.
 */
function isSimplePhaseMode(pricing: EnterprisePricingCents): boolean {
  if (pricing.tiers.length === 0) {
    return false;
  }
  const tierPrices = deriveTierPrices(pricing.tiers, pricing.currency);
  return tierPrices.length > 0 && tierPrices.every((p) => p === tierPrices[0]);
}

/**
 * Validate that all phases share the same contract-wide structure:
 * billing mode, currency, tier-boundary layout, and simple-vs-tiered shape.
 *
 * These dimensions cannot vary inside a single Metronome contract — they
 * determine which products the overrides target and what value is stored in
 * the contract-level MAU_TIERS / MAU_THRESHOLD custom fields. Only prices and
 * floor amounts are allowed to differ across phases.
 */
function assertPhasesAreConsistent(phases: EnterprisePricingPhase[]): void {
  if (phases.length <= 1) {
    return;
  }
  const first = phases[0].pricing;

  for (let i = 1; i < phases.length; i++) {
    const p = phases[i].pricing;
    if (p.currency !== first.currency) {
      throw new Error(
        `Phase ${i} currency (${p.currency}) differs from phase 0 (${first.currency}) — currency cannot change within a single Metronome contract.`
      );
    }
    if (p.billingMode !== first.billingMode) {
      throw new Error(
        `Phase ${i} billing mode (${p.billingMode}) differs from phase 0 (${first.billingMode}) — billing mode cannot change within a single Metronome contract.`
      );
    }
    if (first.billingMode === "FIXED") {
      continue;
    }
    if (p.tiers.length !== first.tiers.length) {
      throw new Error(
        `Phase ${i} has ${p.tiers.length} tiers, phase 0 has ${first.tiers.length} — tier layout must match across phases.`
      );
    }
    for (let t = 0; t < first.tiers.length; t++) {
      if (p.tiers[t].upTo !== first.tiers[t].upTo) {
        throw new Error(
          `Phase ${i} tier ${t} boundary (${p.tiers[t].upTo}) differs from phase 0 (${first.tiers[t].upTo}) — tier boundaries must match across phases.`
        );
      }
    }
    if (isSimplePhaseMode(p) !== isSimplePhaseMode(first)) {
      throw new Error(
        `Phase ${i} switches between simple and tiered mode vs phase 0 — all phases must use the same shape.`
      );
    }
  }
}

/**
 * Build the Metronome contract edit payload for enterprise pricing overrides.
 *
 * Each phase in `phases` produces its own time-bounded set of rate overrides
 * (and a recurring commit, if it has a floor). Subscriptions and custom
 * fields are contract-scoped and emitted once, derived from the first phase.
 *
 * For MAU-based plans (MAU_1/5/10):
 * - Uses MAU Tier products (one per Stripe tier) with FLAT rate overrides.
 * - Disables the default MAU product (or, in simple mode, the tier products).
 * - Sets MAU_TIERS and MAU_THRESHOLD custom fields for syncMauCount.
 * - Recurring prepaid commit for the floor (if any), applicable to MAU Tier 1.
 *
 * For FIXED plans:
 * - Disables all MAU products (billing is a flat Stripe fee).
 */
export function buildEnterpriseOverrides({
  phases,
  initialMauCount,
}: {
  phases: EnterprisePricingPhase[];
  initialMauCount: number;
}): EnterpriseOverridesPayload {
  if (phases.length === 0) {
    throw new Error("buildEnterpriseOverrides requires at least one phase");
  }
  assertPhasesAreConsistent(phases);

  const firstPhase = phases[0];
  const { currency, billingMode } = firstPhase.pricing;
  const creditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[currency];
  if (!creditTypeId) {
    throw new Error(
      `Unsupported currency "${currency}" for enterprise pricing — add it to CURRENCY_TO_CREDIT_TYPE_ID`
    );
  }

  // Disable a product for the full contract lifetime — these are products
  // we're never going to bill on, regardless of phase.
  const disableOverrideForContract = (productId: string): OverrideEntry => ({
    starting_at: firstPhase.startDate,
    type: "OVERWRITE" as const,
    entitled: false,
    override_specifiers: [
      { product_id: productId, billing_frequency: "MONTHLY" as const },
    ],
    overwrite_rate: {
      rate_type: "FLAT" as const,
      price: 0,
      credit_type_id: creditTypeId,
    },
  });

  // FIXED: disable all MAU products — billing is a flat Stripe fee.
  if (billingMode === "FIXED") {
    return {
      overrides: [
        disableOverrideForContract(getProductMauId()),
        ...getProductMauTierIds().map(disableOverrideForContract),
      ],
    };
  }

  if (firstPhase.pricing.tiers.length > MAX_MAU_TIERS) {
    throw new Error(
      `Too many tiers (${firstPhase.pricing.tiers.length}) — max ${MAX_MAU_TIERS} supported`
    );
  }

  const tierProductIds = getProductMauTierIds();
  const mauThreshold = String(billingModeToMauThreshold(billingMode));
  const useSimpleMode = isSimplePhaseMode(firstPhase.pricing);

  // Helper: build a price override for one product, scoped to a single phase.
  const phasePriceOverride = (
    phase: EnterprisePricingPhase,
    productId: string,
    price: number
  ): OverrideEntry => ({
    starting_at: phase.startDate,
    ...(phase.endDate ? { ending_before: phase.endDate } : {}),
    type: "OVERWRITE" as const,
    entitled: true,
    override_specifiers: [
      { product_id: productId, billing_frequency: "MONTHLY" as const },
    ],
    overwrite_rate: {
      rate_type: "FLAT" as const,
      price,
      credit_type_id: creditTypeId,
    },
  });

  // Helper: build a recurring commit for a phase's floor, scoped to that phase.
  const phaseFloorCommit = (
    phase: EnterprisePricingPhase,
    applicableProductId: string
  ): RecurringCommitEntry | undefined => {
    if (phase.pricing.floorCents <= 0) {
      return undefined;
    }
    const floorMetronome = metronomeAmount(
      phase.pricing.floorCents,
      phase.pricing.currency
    );
    return {
      product_id: getProductMauCommitId(),
      name: "MAU Commit",
      starting_at: phase.startDate,
      ...(phase.endDate ? { ending_before: phase.endDate } : {}),
      rate_type: "LIST_RATE" as const,
      priority: 100,
      access_amount: {
        credit_type_id: creditTypeId,
        unit_price: floorMetronome,
        quantity: 1,
      },
      invoice_amount: {
        credit_type_id: creditTypeId,
        unit_price: floorMetronome,
        quantity: 1,
      },
      commit_duration: { value: 1, unit: "PERIODS" as const },
      recurrence_frequency: "MONTHLY" as const,
      applicable_product_ids: [applicableProductId],
    };
  };

  if (useSimpleMode) {
    const overrides: OverrideEntry[] = [];
    const recurringCommits: RecurringCommitEntry[] = [];

    for (const phase of phases) {
      const tierPrices = deriveTierPrices(
        phase.pricing.tiers,
        phase.pricing.currency
      );
      overrides.push(
        phasePriceOverride(phase, getProductMauId(), tierPrices[0])
      );
      const commit = phaseFloorCommit(phase, getProductMauId());
      if (commit) {
        recurringCommits.push(commit);
      }
    }
    // Tier products stay disabled for the entire contract — simple mode only
    // bills the MAU product.
    overrides.push(...tierProductIds.map(disableOverrideForContract));

    return {
      overrides,
      add_subscriptions: [
        {
          collection_schedule: "ADVANCE" as const,
          subscription_rate: {
            billing_frequency: "MONTHLY" as const,
            product_id: getProductMauId(),
          },
          quantity_management_mode: "QUANTITY_ONLY" as const,
          initial_quantity: initialMauCount,
          proration: {
            is_prorated: false,
            invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE" as const,
          },
        },
      ],
      ...(recurringCommits.length > 0
        ? { recurring_commits: recurringCommits }
        : {}),
      custom_fields: {
        MAU_THRESHOLD: mauThreshold,
      },
    };
  }

  // Multi-tier: use MAU Tier products with per-tier FLAT prices.
  const overrides: OverrideEntry[] = [];
  const recurringCommits: RecurringCommitEntry[] = [];

  // Disable the default MAU product for the contract — tiered contracts bill
  // through the MAU Tier products instead.
  overrides.push(disableOverrideForContract(getProductMauId()));

  for (const phase of phases) {
    const tierPrices = deriveTierPrices(
      phase.pricing.tiers,
      phase.pricing.currency
    );
    for (let i = 0; i < phase.pricing.tiers.length; i++) {
      overrides.push(
        phasePriceOverride(phase, tierProductIds[i], tierPrices[i])
      );
    }
    const commit = phaseFloorCommit(phase, tierProductIds[0]);
    if (commit) {
      recurringCommits.push(commit);
    }
  }

  // Disable unused tier products for the entire contract (these don't change
  // across phases — tier count is invariant per assertPhasesAreConsistent).
  for (let i = firstPhase.pricing.tiers.length; i < MAX_MAU_TIERS; i++) {
    overrides.push(disableOverrideForContract(tierProductIds[i]));
  }

  // Add subscriptions for each enabled tier (so syncMauCount can set
  // quantities). Distribute the initial MAU count across tiers for the first
  // invoice, using the first phase's tier boundaries — tier layout is
  // invariant across phases per assertPhasesAreConsistent.
  const mauTiersField = buildMauTiersField(firstPhase.pricing.tiers);
  const tierBoundaries = parseMauTiers(mauTiersField) ?? [];
  const addSubscriptions: SubscriptionEntry[] = [];
  for (let i = 0; i < firstPhase.pricing.tiers.length; i++) {
    const tierQuantity = tierBoundaries[i]
      ? computeTierQuantity(initialMauCount, tierBoundaries[i])
      : 0;

    addSubscriptions.push({
      collection_schedule: "ADVANCE" as const,
      subscription_rate: {
        billing_frequency: "MONTHLY" as const,
        product_id: tierProductIds[i],
      },
      quantity_management_mode: "QUANTITY_ONLY" as const,
      initial_quantity: tierQuantity,
      proration: {
        is_prorated: false,
        invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE" as const,
      },
    });
  }

  return {
    overrides,
    add_subscriptions: addSubscriptions,
    ...(recurringCommits.length > 0
      ? { recurring_commits: recurringCommits }
      : {}),
    custom_fields: {
      MAU_TIERS: mauTiersField,
      MAU_THRESHOLD: mauThreshold,
    },
  };
}

/**
 * Apply enterprise pricing overrides on a Metronome contract.
 * Uses buildEnterpriseOverrides to construct the payload, then sends it.
 *
 * Pass `phases` to express scheduled rate changes (Stripe SubscriptionSchedule
 * phases). Each phase emits its own dated rate overrides + recurring commit.
 */
export async function applyEnterpriseOverrides({
  metronomeCustomerId,
  contractId,
  phases,
  overrideLogger,
  workspaceId,
  initialMauCount,
}: {
  metronomeCustomerId: string;
  contractId: string;
  phases: EnterprisePricingPhase[];
  overrideLogger: Logger;
  workspaceId: string;
  initialMauCount: number;
}): Promise<void> {
  if (phases.length === 0) {
    throw new Error("applyEnterpriseOverrides requires at least one phase");
  }
  const payload = buildEnterpriseOverrides({
    phases,
    initialMauCount,
  });

  const billingMode = phases[0].pricing.billingMode;
  overrideLogger.info(
    { workspaceId, contractId, phaseCount: phases.length, ...payload },
    `Applying enterprise overrides (${billingMode}, ${phases.length} phase${phases.length === 1 ? "" : "s"})`
  );

  const client = getMetronomeClient();

  // Check existing contract state to avoid adding duplicate subscriptions/commits on re-runs.
  let subscriptionsToAdd = payload.add_subscriptions;
  let commitsToAdd = payload.recurring_commits;

  if (
    (subscriptionsToAdd && subscriptionsToAdd.length > 0) ||
    (commitsToAdd && commitsToAdd.length > 0)
  ) {
    const contractResponse = await client.v2.contracts.retrieve({
      customer_id: metronomeCustomerId,
      contract_id: contractId,
    });
    const contractData = contractResponse.data;

    // Filter out subscriptions that already exist.
    if (subscriptionsToAdd && subscriptionsToAdd.length > 0) {
      const existingSubProductIds = new Set(
        (contractData.subscriptions ?? []).map(
          (s) => s.subscription_rate.product.id
        )
      );
      subscriptionsToAdd = subscriptionsToAdd.filter(
        (s) => !existingSubProductIds.has(s.subscription_rate.product_id)
      );
    }

    // Filter out recurring commits whose product already has one.
    if (commitsToAdd && commitsToAdd.length > 0) {
      const existingCommitProductIds = new Set(
        (contractData.recurring_commits ?? []).map((c) => c.product.id)
      );
      commitsToAdd = commitsToAdd.filter(
        (c) => !existingCommitProductIds.has(c.product_id)
      );
    }
  }

  await client.v2.contracts.edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_overrides: payload.overrides,
    ...(subscriptionsToAdd && subscriptionsToAdd.length > 0
      ? { add_subscriptions: subscriptionsToAdd }
      : {}),
    ...(commitsToAdd && commitsToAdd.length > 0
      ? { add_recurring_commits: commitsToAdd }
      : {}),
  });

  // Set custom fields (MAU_TIERS, MAU_THRESHOLD) on the contract.
  if (payload.custom_fields) {
    await client.v1.customFields.setValues({
      entity: "contract",
      entity_id: contractId,
      custom_fields: payload.custom_fields,
    });
  }

  overrideLogger.info(
    { workspaceId, contractId, billingMode },
    "Enterprise overrides applied"
  );
}

/**
 * Provision a Metronome customer + contract for an enterprise workspace,
 * extract MAU pricing from the Stripe subscription, and apply overrides.
 *
 * The enterprise package alias is intentionally a near-empty shell —
 * subscriptions (seats / MAU / tier products) are added by
 * `applyEnterpriseOverrides` below using the live MAU count as
 * `initial_quantity`.
 */
export async function provisionShadowEnterpriseMetronomeContract({
  workspace,
  stripeSubscription,
}: {
  workspace: LightWorkspaceType;
  stripeSubscription: Stripe.Subscription;
}): Promise<
  Result<{ metronomeCustomerId: string; metronomeContractId: string }, Error>
> {
  const stripeCustomerId = stripeSubscription.customer;
  if (!stripeCustomerId || typeof stripeCustomerId !== "string") {
    return new Err(
      new Error(
        `No stripeCustomerId found on subscription ${stripeSubscription.id}`
      )
    );
  }

  // Anchor the Metronome contract to the Stripe billing period start so the
  // recurring commit (which uses the same date) cannot start before the
  // contract — Metronome rejects that as a 400.
  const startDate = floorToHourISO(
    new Date(stripeSubscription.current_period_start * 1000)
  );

  // Extract MAU pricing across all current/future schedule phases (or a single
  // phase from the current items if the subscription has no schedule).
  const phases = await extractEnterprisePricingPhases(
    stripeSubscription,
    startDate,
    logger
  );
  if (phases.length === 0) {
    return new Err(
      new Error(
        `No MAU pricing found in Stripe subscription ${stripeSubscription.id}`
      )
    );
  }

  // Resolve the package alias based on the subscription currency (consistent
  // across phases per assertPhasesAreConsistent).
  const packageAlias = resolvePackageAliasForCurrency(
    LEGACY_ENTERPRISE_PACKAGE_ALIAS,
    phases[0].pricing.currency
  );

  // Ensure the customer exists (creating it if needed) and is linked to
  // Stripe.
  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace,
    stripeCustomerId,
  });
  if (customerResult.isErr()) {
    return new Err(customerResult.error);
  }
  const { metronomeCustomerId } = customerResult.value;

  // Create the (empty) contract directly — overrides below will add the MAU
  // subscriptions with the right initial quantities.
  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    uniquenessKey: stripeSubscription.id,
    startingAt: new Date(startDate),
    enableStripeBilling: false,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }
  const { contractId: metronomeContractId } = contractResult.value;

  // Count MAUs for initial subscription quantities on the first invoice.
  const initialMauCount = await countMauForWorkspace(
    workspace,
    phases[0].pricing.billingMode
  );

  // Apply MAU rate overrides + floor commit (per phase).
  await applyEnterpriseOverrides({
    metronomeCustomerId,
    contractId: metronomeContractId,
    phases,
    overrideLogger: logger,
    workspaceId: workspace.sId,
    initialMauCount,
  });

  return new Ok({ metronomeCustomerId, metronomeContractId });
}
