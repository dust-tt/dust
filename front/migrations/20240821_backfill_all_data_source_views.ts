import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
async function backfillDefaultViewForDataSource(
  auth: Authenticator,
  dataSource: DataSourceResource,
  logger: Logger,
  execute: boolean
): Promise<boolean> {
  const { space } = dataSource;
  // Check if there is already a view for this managed data source in the vault.
  const dataSourceViews =
    await DataSourceViewResource.listForDataSourcesInSpace(
      auth,
      [dataSource],
      space
    );

  if (dataSourceViews.length > 0) {
    logger.info(
      `Data source view already exists for data source ${dataSource.id} in vault ${space.kind} (id: ${dataSourceViews[0].id}).`
    );
    return false;
  }

  if (!execute) {
    return false;
  }

  // Create a default view for this data source in the vault.
  await DataSourceViewResource.createViewInSpaceFromDataSource(
    space,
    dataSource,
    [],
    auth.user()
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

  const globalVault = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  let updated = 0;
  for (const dataSource of dataSources) {
    if (dataSource.space.isSystem()) {
      // Update the kind to "custom" for the data source view created in the global vault.
      const dataSourceViews =
        await DataSourceViewResource.listForDataSourcesInSpace(
          auth,
          [dataSource],
          globalVault
        );
      if (dataSourceViews.length > 0) {
        // Method `updateKind` removed from `DataSourceViewResource`
        // const [dataSourceView] = dataSourceViews;
        // await dataSourceView.updateKind(auth, "custom");
      }
    }

    // Otherwise, create a default view in the data source's vault.
    const created = await backfillDefaultViewForDataSource(
      auth,
      dataSource,
      logger,
      execute
    );

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
