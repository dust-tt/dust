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
 * Extract enterprise pricing from a Stripe subscription.
 *
 * Supports two enterprise billing modes:
 * - MAU-based (REPORT_USAGE=MAU_1/5/10): metered, tiered price with floor + per-MAU overage.
 *   Tier 1: up_to=N, flat_amount=floor, unit_amount=0 (included seats)
 *   Tier 2: up_to=inf, unit_amount=per_mau_price (overage)
 * - FIXED (REPORT_USAGE=FIXED): licensed, flat monthly price, no MAU counting.
 *
 * Returns undefined if no enterprise pricing item is found.
 */
export async function extractEnterprisePricing(
  stripeSubscription: Stripe.Subscription,
  pricingLogger: Logger
): Promise<EnterprisePricingCents | undefined> {
  const stripe = getStripeClient();

  for (const item of stripeSubscription.items.data) {
    const reportUsage = item.price.metadata?.REPORT_USAGE;
    if (!isEnterpriseReportUsage(reportUsage)) {
      continue;
    }

    // FIXED pricing: flat monthly fee, no MAU.
    if (!isSupportedCurrency(item.price.currency)) {
      pricingLogger.warn(
        { priceId: item.price.id, currency: item.price.currency },
        "Unsupported enterprise price currency"
      );
      return undefined;
    }

    if (reportUsage === "FIXED") {
      return {
        currency: item.price.currency,
        billingMode: reportUsage,
        tiers: [],
        floorCents: item.price.unit_amount ?? 0,
      };
    }

    // MAU-based pricing: graduated tiered price.
    // Stripe doesn't include tiers in the subscription item by default.
    const price = await stripe.prices.retrieve(item.price.id, {
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

interface OverrideEntry {
  starting_at: string;
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

export interface EnterpriseOverridesPayload {
  overrides: OverrideEntry[];
  add_subscriptions?: SubscriptionEntry[];
  recurring_commits?: Array<{
    product_id: string;
    name: string;
    starting_at: string;
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
  }>;
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
 * Build the Metronome contract edit payload for enterprise pricing overrides.
 *
 * For MAU-based plans (MAU_1/5/10):
 * - Uses MAU Tier products (one per Stripe tier) with FLAT rate overrides.
 * - Disables the default MAU product.
 * - Sets MAU_TIERS and MAU_THRESHOLD custom fields for syncMauCount.
 * - Recurring prepaid commit for the floor (if any), applicable to MAU Tier 1.
 *
 * For FIXED plans:
 * - Disables all MAU products (billing is a flat Stripe fee).
 */
export function buildEnterpriseOverrides({
  pricing,
  startDate,
  initialMauCount,
}: {
  pricing: EnterprisePricingCents;
  startDate: string;
  initialMauCount: number;
}): EnterpriseOverridesPayload {
  const creditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[pricing.currency];
  if (!creditTypeId) {
    throw new Error(
      `Unsupported currency "${pricing.currency}" for enterprise pricing — add it to CURRENCY_TO_CREDIT_TYPE_ID`
    );
  }

  const disableOverride = (productId: string): OverrideEntry => ({
    starting_at: startDate,
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
  if (pricing.billingMode === "FIXED") {
    return {
      overrides: [
        disableOverride(getProductMauId()),
        ...getProductMauTierIds().map(disableOverride),
      ],
    };
  }

  if (pricing.tiers.length > MAX_MAU_TIERS) {
    throw new Error(
      `Too many tiers (${pricing.tiers.length}) — max ${MAX_MAU_TIERS} supported`
    );
  }

  const tierPrices = deriveTierPrices(pricing.tiers, pricing.currency);
  const tierProductIds = getProductMauTierIds();
  const mauThreshold = String(billingModeToMauThreshold(pricing.billingMode));

  // If all tiers have the same effective price, use the simple MAU product
  // instead of tier products. The floor (if any) is still handled by a commit.
  const allSamePrice =
    tierPrices.length > 0 && tierPrices.every((p) => p === tierPrices[0]);

  if (allSamePrice) {
    const overrides: OverrideEntry[] = [
      // Set the MAU product price.
      {
        starting_at: startDate,
        type: "OVERWRITE" as const,
        entitled: true,
        override_specifiers: [
          {
            product_id: getProductMauId(),
            billing_frequency: "MONTHLY" as const,
          },
        ],
        overwrite_rate: {
          rate_type: "FLAT" as const,
          price: tierPrices[0],
          credit_type_id: creditTypeId,
        },
      },
      // Disable all tier products.
      ...tierProductIds.map(disableOverride),
    ];

    const floorMetronome = metronomeAmount(
      pricing.floorCents,
      pricing.currency
    );
    const recurringCommits =
      pricing.floorCents > 0
        ? [
            {
              product_id: getProductMauCommitId(),
              name: "MAU Commit",
              starting_at: startDate,
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
              applicable_product_ids: [getProductMauId()],
            },
          ]
        : undefined;

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
      ...(recurringCommits ? { recurring_commits: recurringCommits } : {}),
      custom_fields: {
        MAU_THRESHOLD: mauThreshold,
      },
    };
  }

  // Multi-tier: use MAU Tier products with per-tier FLAT prices.
  const overrides: OverrideEntry[] = [];

  // Disable the default MAU product (tiered contracts use MAU Tier products instead).
  overrides.push(disableOverride(getProductMauId()));

  // Enable MAU Tier products with per-tier FLAT prices.
  for (let i = 0; i < pricing.tiers.length; i++) {
    overrides.push({
      starting_at: startDate,
      type: "OVERWRITE" as const,
      entitled: true,
      override_specifiers: [
        {
          product_id: tierProductIds[i],
          billing_frequency: "MONTHLY" as const,
        },
      ],
      overwrite_rate: {
        rate_type: "FLAT" as const,
        price: tierPrices[i],
        credit_type_id: creditTypeId,
      },
    });
  }

  // Disable unused tier products.
  for (let i = pricing.tiers.length; i < MAX_MAU_TIERS; i++) {
    overrides.push(disableOverride(tierProductIds[i]));
  }

  // Recurring commit for the floor (flat_amount on first tier).
  // Applicable to MAU Tier 1 so the commit draws down at tier 1's rate.
  const floorMetronome = metronomeAmount(pricing.floorCents, pricing.currency);
  const recurringCommits =
    pricing.floorCents > 0
      ? [
          {
            product_id: getProductMauCommitId(),
            name: "MAU Commit",
            starting_at: startDate,
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
            applicable_product_ids: [tierProductIds[0]],
          },
        ]
      : undefined;

  // Add subscriptions for each enabled tier (so syncMauCount can set quantities).
  // Distribute initialMauCount across tiers for the first invoice.
  const mauTiersField = buildMauTiersField(pricing.tiers);
  const tierBoundaries = parseMauTiers(mauTiersField) ?? [];
  const addSubscriptions: SubscriptionEntry[] = [];
  for (let i = 0; i < pricing.tiers.length; i++) {
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
    ...(recurringCommits ? { recurring_commits: recurringCommits } : {}),
    custom_fields: {
      MAU_TIERS: mauTiersField,
      MAU_THRESHOLD: mauThreshold,
    },
  };
}

/**
 * Apply enterprise pricing overrides on a Metronome contract.
 * Uses buildEnterpriseOverrides to construct the payload, then sends it.
 */
export async function applyEnterpriseOverrides({
  metronomeCustomerId,
  contractId,
  pricing,
  startDate,
  overrideLogger,
  workspaceId,
  initialMauCount,
}: {
  metronomeCustomerId: string;
  contractId: string;
  pricing: EnterprisePricingCents;
  startDate: string;
  overrideLogger: Logger;
  workspaceId: string;
  initialMauCount: number;
}): Promise<void> {
  const payload = buildEnterpriseOverrides({
    pricing,
    startDate,
    initialMauCount,
  });

  overrideLogger.info(
    { workspaceId, contractId, ...payload },
    `Applying enterprise overrides (${pricing.billingMode})`
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
    { workspaceId, contractId, billingMode: pricing.billingMode },
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

  // Extract MAU pricing from the Stripe subscription tiers.
  const enterprisePricing = await extractEnterprisePricing(
    stripeSubscription,
    logger
  );
  if (!enterprisePricing) {
    return new Err(
      new Error(
        `No MAU pricing found in Stripe subscription ${stripeSubscription.id}`
      )
    );
  }

  // Resolve the package alias based on the subscription currency.
  const packageAlias = resolvePackageAliasForCurrency(
    LEGACY_ENTERPRISE_PACKAGE_ALIAS,
    enterprisePricing.currency
  );

  // Anchor the Metronome contract to the Stripe billing period start so the
  // recurring commit (which uses the same date) cannot start before the
  // contract — Metronome rejects that as a 400.
  const startDate = floorToHourISO(
    new Date(stripeSubscription.current_period_start * 1000)
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
    enterprisePricing.billingMode
  );

  // Apply MAU rate overrides + floor commit.
  await applyEnterpriseOverrides({
    metronomeCustomerId,
    contractId: metronomeContractId,
    pricing: enterprisePricing,
    startDate,
    overrideLogger: logger,
    workspaceId: workspace.sId,
    initialMauCount,
  });

  return new Ok({ metronomeCustomerId, metronomeContractId });
}
