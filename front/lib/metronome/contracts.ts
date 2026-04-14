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
  getProductPrepaidCommitId,
  getProductWorkspaceMau1Id,
  getProductWorkspaceMau5Id,
  getProductWorkspaceMau10Id,
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

function getMauProductId(mode: "MAU_1" | "MAU_5" | "MAU_10"): string {
  switch (mode) {
    case "MAU_1":
      return getProductWorkspaceMau1Id();
    case "MAU_5":
      return getProductWorkspaceMau5Id();
    case "MAU_10":
      return getProductWorkspaceMau10Id();
  }
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

/** Metronome tiered rate tier: price per unit, size = number of units in tier (omit for last). */
interface MetronomeTier {
  price: number;
  size?: number;
}

interface OverrideEntry {
  product_id: string;
  starting_at: string;
  type: "OVERWRITE";
  entitled: boolean;
  overwrite_rate: {
    rate_type: "FLAT" | "TIERED";
    price?: number;
    credit_type_id?: string;
    tiers?: MetronomeTier[];
  };
}

export interface EnterpriseOverridesPayload {
  overrides: OverrideEntry[];
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
    commit_duration: { value: number; unit: "PERIODS" };
    recurrence_frequency: "MONTHLY";
    applicable_product_ids: string[];
  }>;
}

/**
 * Convert Stripe graduated tiers to Metronome TIERED rate tiers.
 *
 * Stripe tiers are graduated (each tier has up_to, unit_amount, flat_amount).
 * Metronome tiers use { price, size? } where size = number of units in that tier.
 *
 * The first tier's unit_amount in Stripe is typically $0 (included in the floor).
 * In Metronome, we set the first tier's price to flat_amount / up_to so that
 * the recurring commit draws down at this rate and covers exactly the included units.
 *
 * Example — Stripe:
 *   [{ up_to: 100, unit: 0, flat: 325000 }, { up_to: 200, unit: 3000 }, { up_to: inf, unit: 2500 }]
 * Metronome tiers:
 *   [{ price: 3250, size: 100 }, { price: 3000, size: 100 }, { price: 2500 }]
 * + recurring commit of 325000 (draws down at list rate = 3250/MAU → covers 100 MAUs)
 */
function stripeTiersToMetronomeTiers(
  tiers: StripeTierCents[]
): MetronomeTier[] {
  let previousUpTo = 0;
  return tiers.map((tier, index) => {
    const tierSize = tier.upTo ? tier.upTo - previousUpTo : undefined;
    previousUpTo = tier.upTo ?? previousUpTo;

    // First tier: derive per-unit price from flat_amount / tier size.
    // This ensures the recurring commit covers exactly the included units.
    let price = tier.unitAmountCents;
    if (index === 0 && tier.flatAmountCents > 0 && tierSize) {
      price = Math.round(tier.flatAmountCents / tierSize);
    }

    return {
      price,
      ...(tierSize !== undefined ? { size: tierSize } : {}),
    };
  });
}

/**
 * Build the Metronome contract edit payload for enterprise pricing overrides.
 *
 * For MAU-based plans (MAU_1/5/10):
 * - TIERED rate override matching Stripe's graduated tiers.
 * - Recurring prepaid commit for the floor (if any).
 * - Disables MAU-1 if using MAU-5 or MAU-10.
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
  const disableOverride = (productId: string): OverrideEntry => ({
    product_id: productId,
    starting_at: startDate,
    type: "OVERWRITE" as const,
    entitled: false,
    overwrite_rate: { rate_type: "FLAT" as const, price: 0 },
  });

  // FIXED: disable all MAU products — billing is a flat Stripe fee.
  if (pricing.billingMode === "FIXED") {
    return {
      overrides: [
        disableOverride(getProductWorkspaceMau1Id()),
        disableOverride(getProductWorkspaceMau5Id()),
        disableOverride(getProductWorkspaceMau10Id()),
      ],
    };
  }

  // MAU-based: apply tiered rate override + floor commit.
  const targetProductId = getMauProductId(pricing.billingMode);

  const creditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[pricing.currency];
  if (!creditTypeId) {
    throw new Error(
      `Unsupported currency "${pricing.currency}" for enterprise pricing — add it to CURRENCY_TO_CREDIT_TYPE_ID`
    );
  }

  const overrides: OverrideEntry[] = [];

  if (pricing.billingMode !== "MAU_1") {
    overrides.push(disableOverride(getProductWorkspaceMau1Id()));
  }

  // Convert Stripe graduated tiers to Metronome tiered rate.
  const metronomeTiers = stripeTiersToMetronomeTiers(pricing.tiers);

  overrides.push({
    product_id: targetProductId,
    starting_at: startDate,
    type: "OVERWRITE" as const,
    entitled: true,
    overwrite_rate: {
      rate_type: "TIERED" as const,
      credit_type_id: creditTypeId,
      tiers: metronomeTiers,
    },
  });

  // Recurring commit for the floor (flat_amount on first tier).
  const recurringCommits =
    pricing.floorCents > 0
      ? [
          {
            product_id: getProductPrepaidCommitId(),
            name: "MAU Floor (monthly minimum)",
            starting_at: startDate,
            rate_type: "LIST_RATE" as const,
            priority: 100,
            access_amount: {
              credit_type_id: creditTypeId,
              unit_price: pricing.floorCents,
              quantity: 1,
            },
            commit_duration: { value: 1, unit: "PERIODS" as const },
            recurrence_frequency: "MONTHLY" as const,
            applicable_product_ids: [targetProductId],
          },
        ]
      : undefined;

  return {
    overrides,
    ...(recurringCommits ? { recurring_commits: recurringCommits } : {}),
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

  await getMetronomeClient().v2.contracts.edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_overrides: payload.overrides,
    ...(payload.recurring_commits
      ? { add_recurring_commits: payload.recurring_commits }
      : {}),
  });

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
