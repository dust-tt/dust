import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";

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

  if (!execute) {
    return;
  }

  const globalVault = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

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
    await DataSourceViewResource.createViewInSpaceFromDataSource(
      globalVault,
      dataSource,
      [],
      auth.user()
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
