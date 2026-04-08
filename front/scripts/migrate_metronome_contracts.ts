/**
 * Migrate existing Metronome contracts to the latest package version.
 *
 * For each workspace with a metronomeCustomerId:
 * 1. List active contracts
 * 2. Check if the contract's package_id matches an old/shadow package
 * 3. If so, end the old contract and create a new one using the latest package alias
 * 4. Update metronomeContractId on the subscription
 *
 * Run with: npx tsx scripts/migrate_metronome_contracts.ts [--execute] [-w workspaceId]
 *
 * Without --execute, runs in dry-run mode (logs what would happen, no changes).
 */

import { getMetronomeClient } from "@app/lib/metronome/client";
import { provisionSeatsForContract } from "@app/lib/metronome/seats";
import {
  LEGACY_BUSINESS_PACKAGE_ALIAS,
  LEGACY_PRO_ANNUAL_PACKAGE_ALIAS,
  LEGACY_PRO_MONTHLY_PACKAGE_ALIAS,
} from "@app/lib/metronome/types";
import {
  PRO_PLAN_SEAT_29_CODE,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { getStripeSubscription } from "@app/lib/plans/stripe";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";
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
 */
async function getSubscriptionInfo(
  workspaceId: number,
  logger: Logger
): Promise<
  | { packageAlias: string; startDate: string; subscriptionModelId: number }
  | undefined
> {
  const subscription =
    await SubscriptionResource.fetchActiveByWorkspaceModelId(workspaceId);

  if (!subscription?.stripeSubscriptionId) {
    return undefined;
  }

  // Get Stripe subscription start date, rounded to hour boundary (Metronome requirement).
  let startDate: string | undefined;
  let isAnnual = false;
  try {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (stripeSubscription) {
      const startTimestamp =
        stripeSubscription.start_date ??
        stripeSubscription.current_period_start;
      // Round to hour boundary (Metronome requirement).
      const rounded = Math.floor(startTimestamp / 3600) * 3600;
      startDate = new Date(rounded * 1000).toISOString();

      // Detect annual billing from the Stripe price interval.
      const interval =
        stripeSubscription.items?.data[0]?.price?.recurring?.interval;
      isAnnual = interval === "year";
    }
  } catch (err) {
    logger.warn(
      { workspaceId, error: String(err) },
      "Failed to fetch Stripe subscription — skipping"
    );
    return undefined;
  }

  if (!startDate) {
    return undefined;
  }

  // Determine alias from plan code + billing interval.
  const isPro = subscription.getPlan().code === PRO_PLAN_SEAT_29_CODE;
  const isBusiness = subscription.getPlan().code === PRO_PLAN_SEAT_39_CODE;
  let packageAlias: string;
  if (isBusiness) {
    packageAlias = LEGACY_BUSINESS_PACKAGE_ALIAS;
  } else if (isPro) {
    packageAlias = isAnnual
      ? LEGACY_PRO_ANNUAL_PACKAGE_ALIAS
      : LEGACY_PRO_MONTHLY_PACKAGE_ALIAS;
  } else {
    return undefined;
  }

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
    logger.info(
      {
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        metronomeCustomerId,
        packageAlias: targetPackageAlias,
        targetPackageId,
        startDate: subInfo.startDate,
        subscriptionModelId: subInfo.subscriptionModelId,
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

    // Provision seats for all existing members.
    const seatResult = await provisionSeatsForContract({
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

    // Already on the latest version?
    if (contractPackageId === targetPackageId) {
      logger.info(
        {
          workspaceId: workspace.sId,
          contractId: contract.id,
          targetAlias,
        },
        "Contract already on target package — skipping"
      );
      continue;
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

    // 3. Provision seats on the new contract.
    const seatResult2 = await provisionSeatsForContract({
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

    // 4. Update metronomeContractId on the active subscription.
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
