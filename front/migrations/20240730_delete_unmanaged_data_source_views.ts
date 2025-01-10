import type { LightWorkspaceType } from "@dust-tt/types";
import assert from "assert";

import { Authenticator } from "@app/lib/auth";
import { isManaged } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function deleteUnmanagedDataSourceViewsForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // List workspace data sources.
  const dataSources = await DataSourceResource.listByWorkspace(auth);

  // List workspace data source views.
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);

  logger.info(
    `Found ${dataSourceViews.length} data source views for workspace(${workspace.sId}).`
  );

  const viewsToDelete: DataSourceViewResource[] = [];
  for (const dataSourceView of dataSourceViews) {
    const ds = dataSources.find((ds) => ds.id === dataSourceView.dataSourceId);
    assert(ds, `Data source ${dataSourceView.dataSourceId} not found.`);

    // If data source is not managed, delete the view.
    if (!isManaged(ds)) {
      viewsToDelete.push(dataSourceView);
    }
  }

  logger.info(
    `About to delete ${viewsToDelete.length} unmanaged data source views for workspace(${workspace.sId}).`
  );

  if (!execute) {
    return;
  }

  for (const view of viewsToDelete) {
    await view.delete(auth, { hardDelete: true });
    logger.info(`Deleted view for data source ${view.dataSourceId}.`);
  }

  logger.info(
    `Deleted all unmanaged data source views for workspace(${workspace.sId}).`
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await deleteUnmanagedDataSourceViewsForWorkspace(
      workspace,
      logger,
      execute
    );
  });
});
