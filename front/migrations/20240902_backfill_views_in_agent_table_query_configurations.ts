import type { LightWorkspaceType } from "@dust-tt/types";
import assert from "assert";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

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

  const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);

  // Retrieve data source views for data sources.
  const dataSourceViews =
    await DataSourceViewResource.listForDataSourcesInVault(
      auth,
      dataSources,
      globalVault
    );

  // Count agent tables query configurations that uses those data sources and have no dataSourceViewId.
  const agenTablesQueryConfigurationsCount =
    await AgentTablesQueryConfigurationTable.count({
      where: {
        // /!\ `dataSourceId` is the data source's name, not the id.
        dataSourceId: dataSources.map((ds) => ds.name),
        dataSourceViewId: {
          [Op.is]: null,
        },
      },
    });

  logger.info(
    `About to update ${agenTablesQueryConfigurationsCount} agent tables query configurations for workspace(${workspace.sId}).`
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
          // /!\ `dataSourceId` is the data source's name, not the id.
          dataSourceId: ds.name,
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
