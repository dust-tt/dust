import assert from "assert";
import type { GroupedCountResultItem } from "sequelize";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type { LightWorkspaceType } from "@app/types";
async function backfillViewsInAgentTableQueryConfigurationForWorkspace(
  workspace: LightWorkspaceType,
  logger: Logger,
  execute: boolean
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  // List workspace data sources.
  const dataSources = await DataSourceResource.listByWorkspace(auth);

  logger.info(
    `Found ${dataSources.length} data sources for workspace(${workspace.sId}).`
  );

  const globalVault = await SpaceResource.fetchWorkspaceGlobalSpace(auth);

  // Retrieve data source views for data sources.
  const dataSourceViews =
    await DataSourceViewResource.listForDataSourcesInSpace(
      auth,
      dataSources,
      globalVault
    );

  // Count agent tables query configurations that uses those data sources and have no dataSourceViewId.
  const agentTablesQueryConfigurationsCount: GroupedCountResultItem[] =
    await AgentTablesQueryConfigurationTable.count({
      // @ts-expect-error `dataSourceViewId` is not nullable.
      where: {
        dataSourceId: dataSources.map((ds) => ds.id),
        dataSourceViewId: {
          [Op.is]: null,
        },
      },
    });

  logger.info(
    `About to update ${agentTablesQueryConfigurationsCount} agent tables query configurations for workspace(${workspace.sId}).`
  );

  if (!execute) {
    return;
  }

  for (const ds of dataSources) {
    const dataSourceView = dataSourceViews.find(
      (dsv) => dsv.dataSourceId === ds.id
    );
    assert(
      dataSourceView,
      `Data source view not found for data source ${ds.id}.`
    );

    await AgentTablesQueryConfigurationTable.update(
      { dataSourceViewId: dataSourceView.id },
      {
        where: {
          dataSourceId: ds.id,
        },
      }
    );

    logger.info(
      `Updated agent tables query configuration for data source ${ds.id}.`
    );
  }

  logger.info(
    `Updated all agent tables query configurations for workspace(${workspace.sId}).`
  );
}

makeScript({}, async ({ execute }, logger) => {
  return runOnAllWorkspaces(async (workspace) => {
    await backfillViewsInAgentTableQueryConfigurationForWorkspace(
      workspace,
      logger,
      execute
    );

    logger.info(`Finished backfilling views for workspace(${workspace.sId}).`);
  });
});
