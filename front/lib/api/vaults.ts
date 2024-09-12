import type { Authenticator } from "@app/lib/auth";
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
  // TODO(VAULTS_INFRA check if datasource is used in any agent configuration)

  await frontSequelize.transaction(async (t) => {
    // delete all data source views
    for (const view of dataSourceViews) {
      const res = await view.delete(auth, t);
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
