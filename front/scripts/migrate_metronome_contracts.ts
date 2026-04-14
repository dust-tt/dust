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

import {
  ceilToHourISO,
  epochSecondsToFloorHourISO,
  getMetronomeClient,
} from "@app/lib/metronome/client";
import {
  buildEnterpriseOverrides,
  type EnterprisePricingCents,
  extractEnterprisePricing,
} from "@app/lib/metronome/contracts";
import { syncMauCount } from "@app/lib/metronome/mau_sync";
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
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { isSupportedCurrency } from "@app/types/currency";
import type { LightWorkspaceType } from "@app/types/user";
import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// Enterprise pricing extraction and override logic lives in
// lib/metronome/stripe_migration.ts — imported at the top of this file.

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
  workspace: LightWorkspaceType,
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
  const subscription = await SubscriptionResource.fetchActiveByWorkspaceModelId(
    workspace.id
  );

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
  const startDate = epochSecondsToFloorHourISO(
    stripeSubscription.current_period_start
  );
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
        { workspaceId: workspace.sId, planCode },
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

  // Get subscription info (needed for package alias, start date, enterprise pricing).
  const subInfo = await getSubscriptionInfo(workspace, logger);
  if (!subInfo) {
    logger.info(
      { workspaceId: workspace.sId },
      "No subscription found, skipping."
    );
    return;
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

  const targetAlias = subInfo.packageAlias;
  const isEnterprise =
    targetAlias === LEGACY_ENTERPRISE_PACKAGE_ALIAS ||
    targetAlias === LEGACY_ENTERPRISE_EUR_PACKAGE_ALIAS;

  // List active contracts for this customer.
  const contractsResponse = await client.v2.contracts.list({
    customer_id: metronomeCustomerId,
  });
  const activeContracts = contractsResponse.data.filter(
    (c) => !c.archived_at && !c.ending_before
  );

  // Resolve old contract info (if any) for logging and alias migration.
  let oldContractId: string | undefined;
  let oldAlias: string | undefined;
  for (const contract of activeContracts) {
    const contractPackageId = (contract as unknown as { package_id?: string })
      .package_id;
    if (!contractPackageId) {
      logger.info(
        { workspaceId: workspace.sId, contractId: contract.id },
        "Contract has no package_id — skipping (manually created?)"
      );
      continue;
    }
    oldAlias = packageInfo.packageIdToAlias[contractPackageId];
    oldContractId = contract.id;
    break;
  }

  // Build enterprise overrides for both logging and contract creation.
  const enterpriseOverrides =
    isEnterprise && subInfo.enterprisePricing
      ? buildEnterpriseOverrides({
          pricing: subInfo.enterprisePricing,
          startDate: subInfo.startDate,
        })
      : undefined;

  logger.info(
    {
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      metronomeCustomerId,
      targetAlias,
      targetPackageId,
      startDate: subInfo.startDate,
      ...(oldContractId
        ? { oldContractId, oldAlias, action: "MIGRATE" }
        : { action: "CREATE_NEW" }),
      ...(enterpriseOverrides
        ? { metronomeOverrides: enterpriseOverrides }
        : {}),
    },
    `${execute ? "" : "[DRYRUN] "}${oldContractId ? "Migrating contract" : "Creating new contract"}`
  );

  if (!execute) {
    return;
  }

  // End old contract if one exists.
  if (oldContractId) {
    const now = ceilToHourISO(new Date());
    await client.v1.contracts.updateEndDate({
      customer_id: metronomeCustomerId,
      contract_id: oldContractId,
      ending_before: now,
    });
    logger.info(
      {
        workspaceId: workspace.sId,
        contractId: oldContractId,
        endingBefore: now,
      },
      "Old contract ended"
    );
  }

  // Create new contract with enterprise overrides (if any).
  const newContract = await client.v1.contracts.create({
    customer_id: metronomeCustomerId,
    package_alias: targetAlias,
    starting_at: subInfo.startDate,
    ...enterpriseOverrides,
  });
  const newContractId = newContract.data.id;

  logger.info(
    { workspaceId: workspace.sId, contractId: newContractId, targetAlias },
    "New contract created"
  );

  // Sync subscriptions: seats for pro/business, MAU for enterprise.
  if (isEnterprise) {
    const mauResult = await syncMauCount({
      metronomeCustomerId,
      contractId: newContractId,
      workspace,
      startingAt: subInfo.startDate,
    });
    if (mauResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          contractId: newContractId,
          error: mauResult.error.message,
        },
        "Failed to sync MAU on new contract"
      );
    }
  } else {
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
