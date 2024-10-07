import type { DataSourceWithAgentsUsageType, Result } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { uniq } from "lodash";

import { softDeleteDataSourceAndLaunchScrubWorkflow } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { KeyResource } from "@app/lib/resources/key_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { VaultResource } from "@app/lib/resources/vault_resource";

export const deleteVault = async (
  auth: Authenticator,
  vault: VaultResource
): Promise<Result<undefined, Error>> => {
  if (!auth.isAdmin()) {
    throw new Error("Only admins can delete vaults.");
  }
  if (!vault.isRegular()) {
    throw new Error("Cannot delete non regular vaults.");
  }

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
        "Canno't delete group with active API Keys. Please revoke all keys before."
      )
    );
  }

  await frontSequelize.transaction(async (t) => {
    // delete all data source views
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

    for (const ds of dataSources) {
      const res = await softDeleteDataSourceAndLaunchScrubWorkflow(auth, ds, t);
      if (res.isErr()) {
        throw res.error;
      }
    }

    // delete all vaults groups
    for (const group of vault.groups) {
      const res = await group.delete(auth, { transaction: t });
      if (res.isErr()) {
        throw res.error;
      }
    }

    // Finally, delete the vault
    const res = await vault.delete(auth, { transaction: t });
    if (res.isErr()) {
      throw res.error;
    }
  });

  return new Ok(undefined);
};
