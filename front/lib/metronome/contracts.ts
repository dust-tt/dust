import {
  ceilToHourISO,
  createMetronomeContract,
  createMetronomeCustomer,
  epochSecondsToFloorHourISO,
  findMetronomeCustomerByAlias,
  getMetronomeClient,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  CURRENCY_TO_CREDIT_TYPE_ID,
  getProductMauCommitId,
  getProductMauId,
  getProductMauTierIds,
  MAX_MAU_TIERS,
} from "@app/lib/metronome/constants";
import { syncMauCount } from "@app/lib/metronome/mau_sync";
import { syncSeatCount } from "@app/lib/metronome/seats";
import { LEGACY_ENTERPRISE_PACKAGE_ALIAS } from "@app/lib/metronome/types";
import { resolvePackageAliasForCurrency } from "@app/lib/plans/billing_currency";
import { getStripeClient } from "@app/lib/plans/stripe";
import {
  isEnterpriseReportUsage,
  type SupportedEnterpriseReportUsage,
} from "@app/lib/plans/usage/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import logger from "@app/logger/logger";
import { isSupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import type Stripe from "stripe";

/**
 * Switch a Metronome contract to a different package (end old + create new).
 * Customer must already exist.
 */
export async function switchMetronomeContractPackage({
  metronomeCustomerId,
  oldContractId,
  workspace,
  packageAlias,
}: {
  metronomeCustomerId: string;
  oldContractId: string;
  workspace: LightWorkspaceType;
  packageAlias: string;
}): Promise<Result<{ metronomeContractId: string }, Error>> {
  // Pre-round to the next hour boundary so both functions (which apply ceil
  // and floor respectively) resolve to the same timestamp, ensuring the new
  // contract starts exactly when the old one ends.
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
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const { contractId: metronomeContractId, startingAt } = contractResult.value;

  const syncFns = [
    () =>
      syncSeatCount({
        metronomeCustomerId,
        contractId: metronomeContractId,
        workspace,
        startingAt,
      }),
    () =>
      syncMauCount({
        metronomeCustomerId,
        contractId: metronomeContractId,
        workspace,
        startingAt,
      }),
  ];
  await concurrentExecutor(syncFns, (fn) => fn(), { concurrency: 2 });

  return new Ok({ metronomeContractId });
}

/**
 * Ensure a Metronome customer and contract exist for a workspace.
 * Creates the customer if missing, then creates a contract via the package alias.
 * Used from both Stripe webhook (checkout) and Poke (admin upgrade).
 */
export async function provisionMetronomeCustomerAndContract({
  workspace,
  stripeCustomerId,
  packageAlias,
  uniquenessKey,
}: {
  workspace: LightWorkspaceType;
  stripeCustomerId: string;
  packageAlias: string;
  uniquenessKey: string;
}): Promise<
  Result<{ metronomeCustomerId: string; metronomeContractId: string }, Error>
> {
  // Find or create customer.
  let metronomeCustomerId: string | null = null;

  const findResult = await findMetronomeCustomerByAlias(workspace.sId);
  if (findResult.isOk()) {
    metronomeCustomerId = findResult.value;
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

  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    uniquenessKey,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const { contractId: metronomeContractId, startingAt } = contractResult.value;

  // Provision seats and MAU on the new contract.
  const syncFns = [
    () =>
      syncSeatCount({
        metronomeCustomerId,
        contractId: metronomeContractId,
        workspace,
        startingAt,
      }),
    () =>
      syncMauCount({
        metronomeCustomerId,
        contractId: metronomeContractId,
        workspace,
        startingAt,
      }),
  ];
  await concurrentExecutor(syncFns, (fn) => fn(), { concurrency: 2 });

  return new Ok({
    metronomeCustomerId,
    metronomeContractId,
  });
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
  currency: string;
  /** Billing mode: MAU_1/5/10 for MAU-based, FIXED for flat price. */
  billingMode: SupportedEnterpriseReportUsage;
  /** All pricing tiers from Stripe (empty for FIXED). */
  tiers: StripeTierCents[];
  /** Monthly floor amount in cents (flat_amount on first tier, or unit_amount for FIXED). */
  floorCents: number;
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
 * Convert Stripe cents to Metronome pricing units.
 * USD: Metronome uses cents (same as Stripe) → no conversion.
 * EUR: Metronome uses whole euros → divide by 100.
 */
function stripeCentsToMetronomePrice(cents: number, currency: string): number {
  if (currency === "eur") {
    return Math.round(cents / 100);
  }
  return cents;
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
  currency: string
): number[] {
  let previousUpTo = 0;
  return tiers.map((tier, index) => {
    const tierSize = tier.upTo ? tier.upTo - previousUpTo : undefined;
    previousUpTo = tier.upTo ?? previousUpTo;

    // First tier with floor: derive price from flat_amount / size.
    if (index === 0 && tier.flatAmountCents > 0 && tierSize) {
      // Convert floor to Metronome units first, then divide by tier size.
      const floorMetronome = stripeCentsToMetronomePrice(
        tier.flatAmountCents,
        currency
      );
      return Math.round(floorMetronome / tierSize);
    }
    return stripeCentsToMetronomePrice(tier.unitAmountCents, currency);
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
}: {
  pricing: EnterprisePricingCents;
  startDate: string;
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
  const mauThreshold =
    pricing.billingMode === "MAU_5"
      ? "5"
      : pricing.billingMode === "MAU_10"
        ? "10"
        : "1";

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

    const floorMetronome = stripeCentsToMetronomePrice(
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
          initial_quantity: 0,
          proration: {
            is_prorated: true,
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
  const floorMetronome = stripeCentsToMetronomePrice(
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
            applicable_product_ids: [tierProductIds[0]],
          },
        ]
      : undefined;

  // Add subscriptions for each enabled tier (so syncMauCount can set quantities).
  const addSubscriptions: SubscriptionEntry[] = [];
  for (let i = 0; i < pricing.tiers.length; i++) {
    addSubscriptions.push({
      collection_schedule: "ADVANCE" as const,
      subscription_rate: {
        billing_frequency: "MONTHLY" as const,
        product_id: tierProductIds[i],
      },
      quantity_management_mode: "QUANTITY_ONLY" as const,
      initial_quantity: 0,
      proration: {
        is_prorated: true,
        invoice_behavior: "BILL_ON_NEXT_COLLECTION_DATE" as const,
      },
    });
  }

  // Build custom fields for syncMauCount.
  const mauTiersField = buildMauTiersField(pricing.tiers);

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
}: {
  metronomeCustomerId: string;
  contractId: string;
  pricing: EnterprisePricingCents;
  startDate: string;
  overrideLogger: Logger;
  workspaceId: string;
}): Promise<void> {
  const payload = buildEnterpriseOverrides({ pricing, startDate });

  overrideLogger.info(
    { workspaceId, contractId, ...payload },
    `Applying enterprise overrides (${pricing.billingMode})`
  );

  const client = getMetronomeClient();

  await client.v2.contracts.edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_overrides: payload.overrides,
    ...(payload.add_subscriptions
      ? { add_subscriptions: payload.add_subscriptions }
      : {}),
    ...(payload.recurring_commits
      ? { add_recurring_commits: payload.recurring_commits }
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
 * Seats and MAU are synced by provisionMetronomeCustomerAndContract.
 */
export async function provisionEnterpriseMetronomeContract({
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
    isSupportedCurrency(enterprisePricing.currency)
      ? enterprisePricing.currency
      : "usd"
  );

  // Provision Metronome customer and contract (also syncs seats + MAU).
  const provisionResult = await provisionMetronomeCustomerAndContract({
    workspace,
    stripeCustomerId,
    packageAlias,
    uniquenessKey: stripeSubscription.id,
  });
  if (provisionResult.isErr()) {
    return new Err(provisionResult.error);
  }

  const { metronomeCustomerId, metronomeContractId } = provisionResult.value;

  // Use current billing period start, rounded to hour boundary.
  const startDate = epochSecondsToFloorHourISO(
    stripeSubscription.current_period_start
  );

  // Apply MAU rate overrides + floor commit.
  await applyEnterpriseOverrides({
    metronomeCustomerId,
    contractId: metronomeContractId,
    pricing: enterprisePricing,
    startDate,
    overrideLogger: logger,
    workspaceId: workspace.sId,
  });

  return new Ok({ metronomeCustomerId, metronomeContractId });
}
