import type { DataSourceWithAgentsUsageType } from "@dust-tt/types";
import { uniq } from "lodash";

import { deleteDataSource } from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { VaultResource } from "@app/lib/resources/vault_resource";

export const deleteVault = async (
  auth: Authenticator,
  vault: VaultResource
) => {
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
    throw new Error(
      `Cannot delete vault with data source in use by assistant(s): ${agentNames.join(", ")}.`
    );
  }

  await frontSequelize.transaction(async (t) => {
    // delete all data source views
    for (const view of dataSourceViews) {
      const res = await view.delete(auth, t);
      if (res.isErr()) {
        throw res.error;
      }
    }

    for (const ds of dataSources) {
      const res = await deleteDataSource(auth, ds, t);
      if (res.isErr()) {
        throw res.error;
      }
    }

    // delete all vaults groups
    for (const group of vault.groups) {
      const res = await group.delete(auth, t);
      if (res.isErr()) {
        throw res.error;
      }
    }

    // Finally, delete the vault
    const res = await vault.delete(auth, t);
    if (res.isErr()) {
      throw res.error;
    }
  });
};
