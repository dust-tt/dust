/**
 * Migrate existing Metronome contracts to the latest package version.
 *
 * For each workspace with a metronomeCustomerId:
 * 1. List active contracts
 * 2. Check if the contract's package_id matches an old/shadow package
 * 3. If so, end the old contract and create a new one using the latest package alias
 * 4. Update metronomeContractId on the subscription
 *
 * Enterprise plans: reads the Stripe subscription to extract tiered pricing
 * (MAU price, floor/included seats) and creates a Metronome contract with
 * rate overrides matching the Stripe pricing.
 *
 * Run with: npx tsx scripts/migrate_metronome_contracts.ts [--execute] [-w workspaceId]
 *
 * Without --execute, runs in dry-run mode (logs what would happen, no changes).
 */

import { getMetronomeClient } from "@app/lib/metronome/client";
import {
  CURRENCY_TO_CREDIT_TYPE_ID,
  getProductMauBilling1Id,
  getProductMauBilling5Id,
  getProductMauBilling10Id,
  getProductPrepaidCommitId,
} from "@app/lib/metronome/constants";
import { syncSeatCount } from "@app/lib/metronome/seats";
import {
  LEGACY_BUSINESS_PACKAGE_ALIAS,
  LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS,
  LEGACY_ENTERPRISE_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
  LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";
import { resolvePackageAliasForCurrency } from "@app/lib/plans/billing_currency";
import {
  isEntreprisePlanPrefix,
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { getStripeClient, getStripeSubscription } from "@app/lib/plans/stripe";
import { isMauReportUsage } from "@app/lib/plans/usage/types";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { isSupportedCurrency } from "@app/types/currency";
import type { LightWorkspaceType } from "@app/types/user";
import type Stripe from "stripe";
import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// Map from old alias → current alias.
const ALIAS_MIGRATION: Record<string, string> = {
  "shadow-pro-29": LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
  "shadow-business-39": LEGACY_BUSINESS_PACKAGE_ALIAS,
  "legacy-pro-29": LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
  "legacy-business-39": LEGACY_BUSINESS_PACKAGE_ALIAS,
  "legacy-business-45": LEGACY_BUSINESS_PACKAGE_ALIAS,
  "legacy-pro-27-annual": LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
};

// ---------------------------------------------------------------------------
// Enterprise Stripe pricing extraction
// ---------------------------------------------------------------------------

/** MAU threshold from Stripe metadata REPORT_USAGE (e.g. "MAU_1", "MAU_5", "MAU_10"). */
type MauThreshold = "MAU_1" | "MAU_5" | "MAU_10";

/**
 * Enterprise pricing extracted from Stripe's tiered price.
 * All amounts in cents (USD or EUR).
 */
interface EnterprisePricingCents {
  /** Currency of the Stripe price (e.g. "usd", "eur"). */
  currency: string;
  /** Per-MAU overage price in cents (from the last tier's unit_amount). */
  mauPriceCents: number;
  /** Monthly floor amount in cents (flat_amount on the first tier, 0 if none). */
  floorCents: number;
  /** Number of included seats (up_to on the first tier). */
  includedSeats: number;
  /** Which MAU threshold this price uses (MAU_1, MAU_5, MAU_10). */
  mauThreshold: MauThreshold;
}

function getMauProductId(threshold: MauThreshold): string {
  switch (threshold) {
    case "MAU_1":
      return getProductMauBilling1Id();
    case "MAU_5":
      return getProductMauBilling5Id();
    case "MAU_10":
      return getProductMauBilling10Id();
  }
}

/**
 * Extract enterprise MAU pricing from a Stripe subscription.
 *
 * Enterprise subscriptions on prod_PsyrjK1wsV9vgW have a metered, tiered price
 * with metadata REPORT_USAGE=MAU_1. The tiered structure is:
 *   - Tier 1: up_to=N, flat_amount=floor, unit_amount=0 (included seats)
 *   - Tier 2: up_to=inf, unit_amount=per_mau_price (overage)
 *
 * Returns undefined if the subscription has no MAU price item.
 */
async function extractEnterprisePricing(
  stripeSubscription: Stripe.Subscription,
  logger: Logger
): Promise<EnterprisePricingCents | undefined> {
  const stripe = getStripeClient();

  for (const item of stripeSubscription.items.data) {
    const reportUsage = item.price.metadata?.REPORT_USAGE;
    if (!isMauReportUsage(reportUsage)) {
      continue;
    }

    // Validate it's one of our known MAU thresholds.
    if (
      reportUsage !== "MAU_1" &&
      reportUsage !== "MAU_5" &&
      reportUsage !== "MAU_10"
    ) {
      logger.warn(
        { reportUsage, priceId: item.price.id },
        "Unknown MAU threshold — skipping"
      );
      continue;
    }

    // For tiered prices, Stripe doesn't include tiers in the subscription item
    // by default. Retrieve the full price with tiers expanded.
    const price = await stripe.prices.retrieve(item.price.id, {
      expand: ["tiers"],
    });

    if (!price.tiers || price.tiers.length < 2) {
      logger.warn(
        { priceId: price.id, tiersCount: price.tiers?.length },
        "Enterprise price missing expected tiers"
      );
      return undefined;
    }

    const firstTier = price.tiers[0];
    const lastTier = price.tiers[price.tiers.length - 1];

    return {
      currency: price.currency,
      mauPriceCents: lastTier.unit_amount ?? 0,
      floorCents: firstTier.flat_amount ?? 0,
      includedSeats: firstTier.up_to ?? 0,
      mauThreshold: reportUsage,
    };
  }

  return undefined;
}

/**
 * Apply enterprise pricing on a Metronome contract to match Stripe's tiered pricing.
 *
 * Uses a recurring prepaid commit to model the floor + included seats:
 * 1. A monthly recurring commit of `floorCents` with rate_type COMMIT_RATE.
 *    Usage draws down the commit at the per-MAU commit rate, so the commit
 *    covers `floor / mauPrice` MAUs (the included seats).
 * 2. A commit-specific override sets the commit rate to the per-MAU price.
 * 3. The list rate (overage beyond the commit) is set to the same per-MAU price.
 *
 * Result: single invoice per period with the floor as the minimum charge,
 * included seats consumed from the commit, and overage billed at the list rate.
 *
 * If the customer uses MAU-5 or MAU-10 instead of MAU-1, disables the default
 * MAU-1 product and enables the correct one.
 */
async function applyEnterpriseOverrides({
  metronomeCustomerId,
  contractId,
  pricing,
  startDate,
  logger,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  pricing: EnterprisePricingCents;
  startDate: string;
  logger: Logger;
  workspaceId: string;
}): Promise<void> {
  const client = getMetronomeClient();
  const targetProductId = getMauProductId(pricing.mauThreshold);

  const creditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[pricing.currency];
  if (!creditTypeId) {
    throw new Error(
      `Unsupported currency "${pricing.currency}" for enterprise pricing — add it to CURRENCY_TO_CREDIT_TYPE_ID`
    );
  }

  logger.info(
    {
      workspaceId,
      contractId,
      mauThreshold: pricing.mauThreshold,
      mauPriceCents: pricing.mauPriceCents,
      floorCents: pricing.floorCents,
      includedSeats: pricing.includedSeats,
      currency: pricing.currency,
    },
    `Applying enterprise overrides for MAU Billing (${pricing.mauThreshold})`
  );

  // --- Build overrides ---
  const overrides = [];

  if (pricing.mauThreshold !== "MAU_1") {
    // Disable the default MAU-1 product (base package includes it at $45).
    overrides.push({
      product_id: getProductMauBilling1Id(),
      starting_at: startDate,
      type: "OVERWRITE" as const,
      entitled: false,
      overwrite_rate: { rate_type: "FLAT" as const, price: 0 },
    });
  }

  // List rate override: per-MAU price in the customer's currency.
  // Also used by the recurring commit (rate_type: LIST_RATE) to determine
  // drawdown rate, so floor / mauPrice = included seats.
  overrides.push({
    product_id: targetProductId,
    starting_at: startDate,
    type: "OVERWRITE" as const,
    entitled: true,
    overwrite_rate: {
      rate_type: "FLAT" as const,
      price: pricing.mauPriceCents,
      credit_type_id: creditTypeId,
    },
  });

  // --- Build recurring commit for the floor ---
  const recurringCommits =
    pricing.floorCents > 0
      ? [
          {
            product_id: getProductPrepaidCommitId(),
            name: "MAU Floor (monthly minimum)",
            starting_at: startDate,
            // LIST_RATE: drawdown uses the list rate override (per-MAU price),
            // so floor / mauPrice = number of included MAUs.
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
      : [];

  await client.v2.contracts.edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_overrides: overrides,
    ...(recurringCommits.length > 0
      ? { add_recurring_commits: recurringCommits }
      : {}),
  });

  logger.info(
    {
      workspaceId,
      contractId,
      mauThreshold: pricing.mauThreshold,
      hasFloor: pricing.floorCents > 0,
    },
    "Enterprise overrides applied"
  );
}

/**
 * Get the current package IDs for the latest versions (by listing packages and
 * matching aliases). Also builds a reverse map (package_id → alias) to identify
 * contracts on old package versions.
 */
async function getPackageInfo(): Promise<{
  aliasToPackageId: Record<string, string>;
  packageIdToAlias: Record<string, string>;
}> {
  const client = getMetronomeClient();
  const aliasToPackageId: Record<string, string> = {};
  const packageIdToAlias: Record<string, string> = {};

  // First pass: collect all packages with their aliases.
  // Active packages own the alias; archived packages may have lost theirs
  // (Metronome removes the alias from old versions when a new version claims it).
  const allPackages: {
    id: string;
    name: string | undefined;
    aliases: string[];
    archived: boolean;
  }[] = [];
  for await (const pkg of client.v1.packages.list({
    archive_filter: "ALL",
  })) {
    const aliases = (pkg.aliases ?? []).map((a) => a.name);
    allPackages.push({
      id: pkg.id,
      name: pkg.name,
      aliases,
      archived: !!pkg.archived_at,
    });

    for (const alias of aliases) {
      if (!pkg.archived_at) {
        aliasToPackageId[alias] = pkg.id;
      }
      packageIdToAlias[pkg.id] = alias;
    }
  }

  // Second pass: for archived packages with no aliases, find the current alias
  // by matching the name prefix. Package names are versioned ("Name vN"), so
  // "Legacy Pro $29 v1" shares the prefix "Legacy Pro $29" with "Legacy Pro $29 v2".
  for (const pkg of allPackages) {
    if (pkg.archived && pkg.aliases.length === 0) {
      if (!pkg.name) {
        continue;
      }
      // Strip version suffix (e.g., " v1") to get the base name.
      const baseName = pkg.name.replace(/\s+v\d+$/, "");
      // Find a current (non-archived) package with the same base name.
      const currentPkg = allPackages.find(
        (p) =>
          !p.archived &&
          p.aliases.length > 0 &&
          p.name?.replace(/\s+v\d+$/, "") === baseName
      );
      if (currentPkg) {
        packageIdToAlias[pkg.id] = currentPkg.aliases[0];
      } else {
        // No current version found — store name for logging.
        packageIdToAlias[pkg.id] = pkg.name;
      }
    }
  }

  return { aliasToPackageId, packageIdToAlias };
}

/**
 * Get the package alias and contract start date from the workspace's active subscription.
 * Returns undefined if no active paid subscription.
 *
 * For enterprise plans, also extracts the per-MAU pricing from the Stripe subscription
 * so it can be applied as a rate override on the Metronome contract.
 */
async function getSubscriptionInfo(
  workspaceId: number,
  logger: Logger
): Promise<
  | {
      packageAlias: string;
      startDate: string;
      subscriptionModelId: number;
      enterprisePricing?: EnterprisePricingCents;
    }
  | undefined
> {
  const subscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspaceId);

  if (!subscription?.stripeSubscriptionId) {
    return undefined;
  }

  // Get Stripe subscription start date, rounded to hour boundary (Metronome requirement).
  let stripeSubscription = await getStripeSubscription(
    subscription.stripeSubscriptionId
  );

  if (!stripeSubscription) {
    return undefined;
  }

  // Use current billing period start — not the original subscription start date.
  // This ensures the Metronome contract aligns with the current billing cycle.
  const startTimestamp = stripeSubscription.current_period_start;
  // Round to hour boundary (Metronome requirement).
  const rounded = Math.floor(startTimestamp / 3600) * 3600;
  const startDate = new Date(rounded * 1000).toISOString();
  const stripeCurrency = stripeSubscription.currency;

  // Detect annual billing from the Stripe price interval.
  const firstItem = stripeSubscription.items?.data[0];
  const interval = firstItem?.price?.recurring?.interval;
  const isAnnual = interval === "year";

  const planCode = subscription.getPlan().code;

  // Enterprise plans: extract MAU pricing from Stripe tiers.
  if (isEntreprisePlanPrefix(planCode)) {
    if (!stripeSubscription) {
      return undefined;
    }

    const enterprisePricing = await extractEnterprisePricing(
      stripeSubscription,
      logger
    );
    if (!enterprisePricing) {
      logger.warn(
        { workspaceId, planCode },
        "Enterprise plan but no MAU pricing found in Stripe — skipping"
      );
      return undefined;
    }

    return {
      packageAlias: resolvePackageAliasForCurrency(
        LEGACY_ENTERPRISE_PACKAGE_ALIAS,
        isSupportedCurrency(enterprisePricing.currency)
          ? enterprisePricing.currency
          : "usd"
      ),
      startDate,
      subscriptionModelId: subscription.id,
      enterprisePricing,
    };
  }

  // Determine alias from plan code + billing interval + currency.
  const isPro = planCode === PRO_PLAN_SEAT_29_CODE;
  const isBusiness = planCode === PRO_PLAN_SEAT_39_CODE;
  let baseAlias: string;
  if (isBusiness) {
    baseAlias = LEGACY_BUSINESS_PACKAGE_ALIAS;
  } else if (isPro) {
    baseAlias = isAnnual
      ? LEGACY_PRO_ANNUAL_PACKAGE_ALIAS
      : LEGACY_PRO_MONTHLY_PACKAGE_ALIAS;
  } else {
    return undefined;
  }

  const packageAlias = resolvePackageAliasForCurrency(
    baseAlias,
    isSupportedCurrency(stripeCurrency) ? stripeCurrency : "usd"
  );

  return {
    packageAlias,
    startDate,
    subscriptionModelId: subscription.id,
  };
}

async function migrateWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger,
  packageInfo: {
    aliasToPackageId: Record<string, string>;
    packageIdToAlias: Record<string, string>;
  },
  packageAliasFilter?: string
): Promise<void> {
  const client = getMetronomeClient();
  const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
  if (!workspaceResource?.metronomeCustomerId) {
    return; // No Metronome customer — skip.
  }

  const metronomeCustomerId = workspaceResource.metronomeCustomerId;

  // List active contracts for this customer.
  const contractsResponse = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
  });

  const contracts = contractsResponse.data;

  // Filter to active contracts (not archived, not ended).
  const activeContracts = contracts.filter(
    (c) => !c.archived_at && !c.ending_before
  );

  // No active contracts — create a new one from the subscription.
  if (activeContracts.length === 0) {
    const subInfo = await getSubscriptionInfo(workspace.id, logger);
    if (!subInfo) {
      logger.info(
        { workspaceId: workspace.sId },
        "No subscription found, skipping."
      );
      return; // No paid subscription — skip.
    }

    // Apply package alias filter if set.
    if (packageAliasFilter && subInfo.packageAlias !== packageAliasFilter) {
      return;
    }

    const targetPackageId = packageInfo.aliasToPackageId[subInfo.packageAlias];
    if (!targetPackageId) {
      logger.error(
        { workspaceId: workspace.sId, alias: subInfo.packageAlias },
        "Target package not found — run metronome_setup.ts first"
      );
      return;
    }

    const targetPackageAlias = subInfo.packageAlias;
    const isEnterprise =
      targetPackageAlias === LEGACY_ENTERPRISE_PACKAGE_ALIAS ||
      targetPackageAlias === LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS;

    logger.info(
      {
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        metronomeCustomerId,
        packageAlias: targetPackageAlias,
        targetPackageId,
        startDate: subInfo.startDate,
        subscriptionModelId: subInfo.subscriptionModelId,
        ...(isEnterprise && subInfo.enterprisePricing
          ? {
              enterprisePricing: subInfo.enterprisePricing,
            }
          : {}),
        action: "CREATE_NEW",
      },
      `${execute ? "" : "[DRYRUN] "}Creating new contract (no existing contract)`
    );

    if (!execute) {
      return;
    }

    const newContract = await client.v1.contracts.create({
      customer_id: metronomeCustomerId,
      package_alias: subInfo.packageAlias,
      starting_at: subInfo.startDate,
    });

    const newContractId = newContract.data.id;

    logger.info(
      {
        workspaceId: workspace.sId,
        contractId: newContractId,
        packageAlias: subInfo.packageAlias,
        startDate: subInfo.startDate,
      },
      "New contract created (aligned to Stripe subscription start)"
    );

    // For enterprise contracts, apply rate overrides to match Stripe pricing.
    if (isEnterprise && subInfo.enterprisePricing) {
      await applyEnterpriseOverrides({
        metronomeCustomerId,
        contractId: newContractId,
        pricing: subInfo.enterprisePricing,
        startDate: subInfo.startDate,
        logger,
        workspaceId: workspace.sId,
      });
    }

    // Provision seats for all existing members (for seat-based plans).
    if (!isEnterprise) {
      const seatResult = await syncSeatCount({
        metronomeCustomerId,
        contractId: newContractId,
        workspace,
        startingAt: subInfo.startDate,
      });
      if (seatResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            contractId: newContractId,
            error: seatResult.error.message,
          },
          "Failed to provision seats on new contract"
        );
      }
    }

    // Update metronomeContractId on the subscription.
    await SubscriptionResource.updateMetronomeContractId(
      subInfo.subscriptionModelId,
      newContractId
    );

    logger.info(
      {
        workspaceId: workspace.sId,
        subscriptionId: subInfo.subscriptionModelId,
        newContractId,
      },
      "Updated metronomeContractId on subscription"
    );

    return;
  }

  for (const contract of activeContracts) {
    // V2 API returns package_id but the SDK type doesn't declare it.
    const contractPackageId = (contract as unknown as { package_id?: string })
      .package_id;

    if (!contractPackageId) {
      logger.info(
        { workspaceId: workspace.sId, contractId: contract.id },
        "Contract has no package_id — skipping (manually created?)"
      );
      continue;
    }

    // Look up the alias for this contract's package (includes archived packages).
    const currentAlias =
      packageInfo.packageIdToAlias[contractPackageId] ?? undefined;

    // Determine target alias (map shadow aliases to current ones).
    if (!currentAlias) {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId: contract.id,
          packageId: contractPackageId,
        },
        "Contract's package not found in current packages — skipping"
      );
      continue;
    }
    const targetAlias = ALIAS_MIGRATION[currentAlias] ?? currentAlias;

    // If a package alias filter is set, skip contracts that don't match.
    if (packageAliasFilter && targetAlias !== packageAliasFilter) {
      continue;
    }

    const targetPackageId = packageInfo.aliasToPackageId[targetAlias];
    if (!targetPackageId) {
      logger.error(
        {
          workspaceId: workspace.sId,
          contractId: contract.id,
          targetAlias,
        },
        "Target package not found in Metronome — run metronome_setup.ts first"
      );
      continue;
    }

    if (contractPackageId === targetPackageId) {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId: contract.id,
          targetAlias,
        },
        "Contract already on target package — will recreate"
      );
    }

    logger.info(
      {
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        metronomeCustomerId,
        oldContractId: contract.id,
        oldPackageId: contractPackageId,
        oldAlias: currentAlias,
        targetAlias,
        targetPackageId,
        contractStartDate: contract.starting_at,
        transitionType: "SUPERSEDE",
        action: "MIGRATE",
      },
      `${execute ? "" : "[DRYRUN] "}Migrating contract to latest package`
    );

    if (!execute) {
      continue;
    }

    // Metronome does not support SUPERSEDE for package-based contracts.
    // Approach: end old contract, create new with same starting_at (preserves billing
    // anchor/cycle), transfer remaining credit/commit balances.
    const now = new Date(
      Math.floor(Date.now() / 3_600_000) * 3_600_000
    ).toISOString();

    // 1. End the old contract.
    await client.v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      ending_before: now,
    });

    logger.info(
      {
        workspaceId: workspace.sId,
        contractId: contract.id,
        endingBefore: now,
      },
      "Old contract ended"
    );

    // 2. Create new contract with same starting_at (preserves billing cycle anchor).
    const newContract = await client.v1.contracts.create({
      customer_id: metronomeCustomerId,
      package_alias: targetAlias,
      starting_at: contract.starting_at,
    });

    const newContractId = newContract.data.id;

    logger.info(
      {
        workspaceId: workspace.sId,
        oldContractId: contract.id,
        newContractId,
        targetAlias,
      },
      "New contract created (same starting_at as old)"
    );

    // 3. For enterprise contracts migrating to the enterprise package, apply overrides.
    if (
      targetAlias === LEGACY_ENTERPRISE_PACKAGE_ALIAS ||
      targetAlias === LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS
    ) {
      const subInfo = await getSubscriptionInfo(workspace.id, logger);
      if (subInfo?.enterprisePricing) {
        await applyEnterpriseOverrides({
          metronomeCustomerId,
          contractId: newContractId,
          pricing: subInfo.enterprisePricing,
          startDate: contract.starting_at,
          logger,
          workspaceId: workspace.sId,
        });
      }
    }

    // 4. Provision seats on the new contract (for seat-based plans).
    if (
      targetAlias !== LEGACY_ENTERPRISE_PACKAGE_ALIAS &&
      targetAlias !== LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS
    ) {
      const seatResult2 = await syncSeatCount({
        metronomeCustomerId,
        contractId: newContractId,
        workspace,
        startingAt: contract.starting_at,
      });
      if (seatResult2.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            contractId: newContractId,
            error: seatResult2.error.message,
          },
          "Failed to provision seats on new contract"
        );
      }
    }

    // 5. Update metronomeContractId on the active subscription.
    const activeSubscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);

    if (activeSubscription) {
      await SubscriptionResource.updateMetronomeContractId(
        activeSubscription.id,
        newContractId
      );

      logger.info(
        {
          workspaceId: workspace.sId,
          subscriptionId: activeSubscription.id,
          newContractId,
        },
        "Updated metronomeContractId on subscription"
      );
    } else {
      logger.warn(
        { workspaceId: workspace.sId },
        "No active subscription found — metronomeContractId not updated"
      );
    }
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      describe:
        "Workspace sId to migrate. Omit to migrate all workspaces with Metronome customers.",
      type: "string" as const,
    },
    packageAlias: {
      alias: "p",
      describe:
        "Only migrate contracts targeting this package alias (e.g., 'legacy-pro-29'). Omit to migrate all.",
      type: "string" as const,
    },
  },
  async (args, logger) => {
    const packageAliasFilter = args.packageAlias;
    if (packageAliasFilter) {
      logger.info(
        { packageAlias: packageAliasFilter },
        "Filtering to contracts targeting this package alias"
      );
    }

    logger.info("Fetching latest package versions from Metronome...");
    const packageInfo = await getPackageInfo();
    logger.info(
      { aliases: Object.keys(packageInfo.aliasToPackageId) },
      `Found ${Object.keys(packageInfo.aliasToPackageId).length} packages`
    );

    if (args.workspaceId) {
      const workspace = await WorkspaceResource.fetchById(args.workspaceId);
      if (!workspace) {
        logger.error({ workspaceId: args.workspaceId }, "Workspace not found");
        return;
      }
      await migrateWorkspace(
        renderLightWorkspaceType({ workspace }),
        args.execute,
        logger,
        packageInfo,
        packageAliasFilter
      );
    } else {
      await runOnAllWorkspaces(
        (workspace) =>
          migrateWorkspace(
            workspace,
            args.execute,
            logger,
            packageInfo,
            packageAliasFilter
          ),
        { concurrency: 4 }
      );
    }
  }
);
