import type { LightWorkspaceType } from "@dust-tt/types";

import { Authenticator } from "@app/lib/auth";
import { renderDataSourceType } from "@app/lib/data_sources";
import { DataSource } from "@app/lib/models/data_source";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { VaultResource } from "@app/lib/resources/vault_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function backfillDataSourceViewsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const dataSources = await DataSource.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });

  logger.info(
    `Found ${dataSources.length} data sources for workspace(${workspace.sId}).`
  );

  if (!execute) {
    return;
  }

  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);

  let updated = 0;
  for (const dataSource of dataSources) {
    // Check if there is already a view for this data source.
    const dsv = await DataSourceViewModel.findOne({
      where: {
        workspaceId: workspace.id,
        vaultId: globalVault.id,
        dataSourceId: dataSource.id,
      },
    });

    if (dsv) {
      logger.info(
        `Data source view already exists for data source ${dataSource.id}.`
      );
      continue;
    }

    // Create a view for this data source in the global vault.
    await DataSourceViewResource.createViewInVaultFromDataSourceIncludingAllDocuments(
      globalVault,
      renderDataSourceType(dataSource)
    );

    updated++;

    logger.info(`View created for data source ${dataSource.id}.`);
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
