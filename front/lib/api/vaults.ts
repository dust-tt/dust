import type { DataSourceWithAgentsUsageType, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import assert from "assert";
import { uniq } from "lodash";

import { hardDeleteApp } from "@app/lib/api/apps";
import type { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { VaultResource } from "@app/lib/resources/vault_resource";
import { launchScrubVaultWorkflow } from "@app/poke/temporal/client";

export async function softDeleteVaultAndLaunchScrubWorkflow(
  auth: Authenticator,
  vault: VaultResource
) {
  assert(auth.isAdmin(), "Only admins can delete vaults.");
  assert(vault.isRegular(), "Cannot delete non regular vaults.");

  const dataSourceViews = await DataSourceViewResource.listByVault(auth, vault);

  const usages: DataSourceWithAgentsUsageType[] = [];
  for (const view of dataSourceViews) {
    const usage = await view.getUsagesByAgents(auth);
    if (usage.isErr()) {
      throw usage.error;
    } else if (usage.value.count > 0) {
      usages.push(usage.value);
    }
  }

  const dataSources = await DataSourceResource.listByVault(auth, vault);
  for (const ds of dataSources) {
    const usage = await ds.getUsagesByAgents(auth);
    if (usage.isErr()) {
      throw usage.error;
    } else if (usage.value.count > 0) {
      usages.push(usage.value);
    }
  }

  if (usages.length > 0) {
    const agentNames = uniq(usages.map((u) => u.agentNames).flat());
    return new Err(
      new Error(
        `Cannot delete vault with data source in use by assistant(s): ${agentNames.join(", ")}.`
      )
    );
  }

  const groupHasKeys = await KeyResource.countActiveForGroups(
    auth,
    vault.groups
  );
  if (groupHasKeys > 0) {
    return new Err(
      new Error(
        "Cannot delete group with active API Keys. Please revoke all keys before."
      )
    );
  }

  await frontSequelize.transaction(async (t) => {
    // Soft delete all data source views.
    for (const view of dataSourceViews) {
      // Soft delete view, they will be hard deleted when the data source scrubbing job runs.
      const res = await view.delete(auth, {
        transaction: t,
        hardDelete: false,
      });
      if (res.isErr()) {
        throw res.error;
      }
    }

    // Soft delete data sources they will be hard deleted in the scrubbing job.
    for (const ds of dataSources) {
      const res = await ds.delete(auth, { hardDelete: false, transaction: t });
      if (res.isErr()) {
        throw res.error;
      }
    }

    // Finally, soft delete the vault.
    const res = await vault.delete(auth, { hardDelete: false, transaction: t });
    if (res.isErr()) {
      throw res.error;
    }

    await launchScrubVaultWorkflow(auth, vault);
  });

  return new Ok(undefined);
}

// This method is invoked as part of the workflow to permanently delete a vault.
// It ensures that all data associated with the vault is irreversibly removed from the system,
// EXCEPT for data sources that are handled and deleted directly within the workflow.
export async function hardDeleteVault(
  auth: Authenticator,
  vault: VaultResource
): Promise<Result<void, Error>> {
  assert(auth.isAdmin(), "Only admins can delete vaults.");

  const isDeletableVault =
    vault.isDeleted() || vault.isGlobal() || vault.isSystem();
  assert(isDeletableVault, "Vault is not soft deleted.");

  const dataSourceViews = await DataSourceViewResource.listByVault(
    auth,
    vault,
    { includeDeleted: true }
  );
  for (const dsv of dataSourceViews) {
    const res = await dsv.delete(auth, { hardDelete: true });
    if (res.isErr()) {
      return res;
    }
  }

  const apps = await AppResource.listByVault(auth, vault, {
    includeDeleted: true,
  });
  for (const app of apps) {
    const res = await hardDeleteApp(auth, app);
    if (res.isErr()) {
      return res;
    }
  }

  await frontSequelize.transaction(async (t) => {
    // Delete all vaults groups.
    for (const group of vault.groups) {
      const res = await group.delete(auth, { transaction: t });
      if (res.isErr()) {
        throw res.error;
      }
    }

    const res = await vault.delete(auth, { hardDelete: true, transaction: t });
    if (res.isErr()) {
      throw res.error;
    }
  });

  return new Ok(undefined);
}
