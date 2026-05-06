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
  countMauForWorkspace,
  type EnterprisePricingPhase,
  extractEnterprisePricingPhases,
  provisionEnterpriseContractsForPhases,
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
  isProPlanPrefix,
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
 * — including all SubscriptionSchedule phases — so each phase can be applied as a
 * dated rate override on the Metronome contract.
 */
async function getSubscriptionInfo(
  workspace: LightWorkspaceType,
  logger: Logger
): Promise<
  | {
      packageAlias: string;
      startDate: string;
      subscriptionModelId: number;
      stripeSubscriptionId: string;
      enterprisePhases?: EnterprisePricingPhase[];
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

  // Enterprise plans: extract MAU pricing per schedule phase from Stripe.
  if (isEntreprisePlanPrefix(planCode)) {
    if (!stripeSubscription) {
      return undefined;
    }

    const enterprisePhases = await extractEnterprisePricingPhases(
      stripeSubscription,
      startDate,
      logger
    );
    if (enterprisePhases.length === 0) {
      logger.warn(
        { workspaceId: workspace.sId, planCode },
        "Enterprise plan but no MAU pricing found in Stripe — skipping"
      );
      return undefined;
    }

    const phaseCurrency = enterprisePhases[0].pricing.currency;
    return {
      packageAlias: resolvePackageAliasForCurrency(
        LEGACY_ENTERPRISE_PACKAGE_ALIAS,
        isSupportedCurrency(phaseCurrency) ? phaseCurrency : "usd"
      ),
      startDate,
      subscriptionModelId: subscription.id,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      enterprisePhases,
    };
  }

  // Determine alias from plan code + billing interval + currency.
  const isBusiness = planCode === PRO_PLAN_SEAT_39_CODE;
  const isPro = !isBusiness && isProPlanPrefix(planCode);

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
    stripeSubscriptionId: subscription.stripeSubscriptionId,
  };
}

/**
 * Enable Stripe billing provider on a Metronome contract.
 * This makes Metronome push invoices to Stripe for real payment collection.
 * Without this, invoices stay in Metronome only (shadow mode).
 */
async function enableStripeBilling({
  metronomeCustomerId,
  contractId,
  logger,
  workspaceId,
}: {
  metronomeCustomerId: string;
  contractId: string;
  logger: Logger;
  workspaceId: string;
}): Promise<void> {
  const client = getMetronomeClient();

  logger.info(
    { workspaceId, contractId },
    "Enabling Stripe billing provider on contract"
  );

  await client.v2.contracts.edit({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_billing_provider_configuration_update: {
      billing_provider_configuration: {
        billing_provider: "stripe",
        delivery_method: "direct_to_billing_provider",
      },
      schedule: {
        effective_at: "START_OF_CURRENT_PERIOD",
      },
    },
  });

  logger.info({ workspaceId, contractId }, "Stripe billing provider enabled");
}

async function migrateWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  force: boolean,
  logger: Logger,
  packageInfo: {
    aliasToPackageId: Record<string, string>;
    packageIdToAlias: Record<string, string>;
  },
  packageAliasFilter?: string,
  forcePackageAlias?: string,
  enableBilling?: boolean
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

  // Apply package alias filter (matched against the *derived* target alias)
  // before any override, so callers can scope a forced migration to e.g.
  // "all monthly Pro contracts → some custom package".
  if (packageAliasFilter && subInfo.packageAlias !== packageAliasFilter) {
    return;
  }

  // Force-override the target alias when the operator passes one.
  if (forcePackageAlias) {
    if (subInfo.packageAlias !== forcePackageAlias) {
      logger.info(
        {
          workspaceId: workspace.sId,
          derivedAlias: subInfo.packageAlias,
          forcedAlias: forcePackageAlias,
        },
        "Forcing target package alias (overriding derived value)"
      );
      subInfo.packageAlias = forcePackageAlias;
    }
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
    // Already on the latest package version — nothing to migrate unless forced.
    if (contractPackageId === targetPackageId && !force) {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId: contract.id,
          targetAlias,
        },
        "Contract already on latest package version — skipping (use --force to re-create)"
      );
      return;
    }
    oldAlias = packageInfo.packageIdToAlias[contractPackageId];
    oldContractId = contract.id;
    break;
  }

  // Count MAUs for initial subscription quantities.
  const enterprisePhases = subInfo.enterprisePhases;
  const initialMauCount =
    isEnterprise && enterprisePhases
      ? await countMauForWorkspace(
          workspace,
          enterprisePhases[0].pricing.billingMode
        )
      : 0;

  // Build per-phase override payloads for logging only — actual contract
  // creation goes through provisionEnterpriseContractsForPhases below.
  const enterpriseOverrides =
    isEnterprise && enterprisePhases
      ? enterprisePhases.map((phase) =>
          buildEnterpriseOverrides({
            pricing: phase.pricing,
            startDate: phase.startDate,
            initialMauCount,
          })
        )
      : undefined;

  logger.info(
    {
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      metronomeCustomerId,
      targetAlias,
      targetPackageId,
      startDate: subInfo.startDate,
      ...(enterprisePhases
        ? {
            phaseCount: enterprisePhases.length,
            phases: enterprisePhases.map((p) => ({
              startDate: p.startDate,
              endDate: p.endDate,
              billingMode: p.pricing.billingMode,
              currency: p.pricing.currency,
              floorCents: p.pricing.floorCents,
              tiers: p.pricing.tiers,
            })),
          }
        : {}),
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

  // Enterprise: create one contract per Stripe schedule phase (chained on the
  // same customer). The contract.start webhook rotates
  // subscription.metronomeContractId when later phases activate.
  // Non-enterprise: a single contract from the package alias.
  let newContractId: string;
  if (isEnterprise && enterprisePhases) {
    const provisionResult = await provisionEnterpriseContractsForPhases({
      metronomeCustomerId,
      workspace,
      phases: enterprisePhases,
      packageAlias: targetAlias,
      // Phase contracts are scoped to a re-migration cycle; include the start
      // date so re-runs after a force migration don't collide.
      uniquenessKeyPrefix: `migrate_${subInfo.startDate}`,
      enableStripeBilling: enableBilling ?? false,
      initialMauCount,
      phaseGroupId: subInfo.stripeSubscriptionId,
      contractsLogger: logger,
    });
    if (provisionResult.isErr()) {
      logger.error(
        { workspaceId: workspace.sId, error: provisionResult.error.message },
        "Failed to provision per-phase enterprise contracts"
      );
      return;
    }
    newContractId = provisionResult.value.contractIds[0];
    logger.info(
      {
        workspaceId: workspace.sId,
        contractIds: provisionResult.value.contractIds,
        phaseCount: enterprisePhases.length,
      },
      "Per-phase enterprise contracts created"
    );
  } else {
    // Metronome does not allow overrides in v1.contracts.create when using a package.
    const newContract = await client.v1.contracts.create({
      customer_id: metronomeCustomerId,
      package_alias: targetAlias,
      starting_at: subInfo.startDate,
    });
    newContractId = newContract.data.id;

    logger.info(
      { workspaceId: workspace.sId, contractId: newContractId, targetAlias },
      "New contract created"
    );
  }

  // Update metronomeContractId on the subscription first so that the contract
  // cache is invalidated before syncing subscriptions (syncMauCount /
  // syncSeatCount call getActiveContract which reads from Redis cache).
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

  // Enable Stripe billing if requested.
  if (enableBilling) {
    await enableStripeBilling({
      metronomeCustomerId,
      contractId: newContractId,
      logger,
      workspaceId: workspace.sId,
    });
  }

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
    forcePackageAlias: {
      alias: "P",
      describe:
        "Override the derived target package alias and use this one instead. Useful for one-off migrations to a custom package; combine with --packageAlias to scope the override.",
      type: "string" as const,
    },
    force: {
      alias: "f",
      describe:
        "Force re-creation of contracts even if already on the latest package version (useful to update overrides).",
      type: "boolean" as const,
      default: false,
    },
    enableBilling: {
      alias: "b",
      describe:
        "Enable Stripe billing provider on created contracts. Without this flag, contracts stay in shadow mode (invoices in Metronome only).",
      type: "boolean" as const,
      default: false,
    },
  },
  async (args, logger) => {
    const packageAliasFilter = args.packageAlias;
    const forcePackageAlias = args.forcePackageAlias;
    const enableBilling = args.enableBilling;
    if (packageAliasFilter) {
      logger.info(
        { packageAlias: packageAliasFilter },
        "Filtering to contracts targeting this package alias"
      );
    }
    if (forcePackageAlias) {
      logger.info(
        { forcePackageAlias },
        "Forcing the target package alias for all migrated contracts"
      );
    }
    if (enableBilling) {
      logger.info("Stripe billing will be enabled on created contracts");
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
        args.force,
        logger,
        packageInfo,
        packageAliasFilter,
        forcePackageAlias,
        enableBilling
      );
    } else {
      await runOnAllWorkspaces(
        (workspace) =>
          migrateWorkspace(
            workspace,
            args.execute,
            args.force,
            logger,
            packageInfo,
            packageAliasFilter,
            forcePackageAlias,
            enableBilling
          ),
        { concurrency: 4 }
      );
    }
  }
);
