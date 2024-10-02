import type { LightWorkspaceType } from "@dust-tt/types";

import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { VaultResource } from "@app/lib/resources/vault_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function backfillDefaultViewForDataSource(
  workspace: LightWorkspaceType,
  vault: VaultResource,
  dataSource: DataSourceResource,
  logger: Logger,
  execute: boolean
): Promise<boolean> {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // Check if there is already a view for this managed data source in the vault.
  const dsv = await DataSourceViewModel.findOne({
    where: {
      workspaceId: workspace.id,
      vaultId: vault.id,
      dataSourceId: dataSource.id,
    },
  });

  if (dsv) {
    logger.info(
      `Data source view already exists for data source ${dataSource.id}.`
    );
    return false;
  }

  if (!execute) {
    return false;
  }

  // Create a default view for this data source in the vault.
  await DataSourceViewResource.createViewInVaultFromDataSource(
    auth,
    vault,
    dataSource,
    []
  );

  logger.info(`View created for data source ${dataSource.id}.`);

  return true;
}

async function backfillDataSourceViewsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const dataSources = await DataSourceResource.listByWorkspace(auth);

  logger.info(
    `Found ${dataSources.length} data sources for workspace(${workspace.sId}).`
  );

  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);

  let updated = 0;
  for (const dataSource of dataSources) {
    let created: boolean;
    // If data source's vault is system, create a default view in the global vault for it.
    if (dataSource.vault.isSystem()) {
      created = await backfillDefaultViewForDataSource(
        workspace,
        globalVault,
        dataSource,
        logger,
        execute
      );
    } else {
      // Otherwise, create a default view in the data source's vault.
      created = await backfillDefaultViewForDataSource(
        workspace,
        dataSource.vault,
        dataSource,
        logger,
        execute
      );
    }

    if (created) {
      updated++;
    }
  }

  logger.info(
    `Backfilled data source views for workspace(${workspace.sId}). (updated: ${updated}/${dataSources.length})`
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillDataSourceViewsForWorkspace(workspace, logger, execute);
  });
});
