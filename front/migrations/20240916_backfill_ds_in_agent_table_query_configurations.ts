import type { LightWorkspaceType } from "@dust-tt/types";
import assert from "assert";
import type { GroupedCountResultItem } from "sequelize";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { VaultResource } from "@app/lib/resources/vault_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";

async function backfillDataSourceIdInAgentTableQueryConfigurationForWorkspace(
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

  // Count agent tables query configurations that uses those data sources and have no dataSourceIdNew.
  const agentTablesQueryConfigurationsCount: GroupedCountResultItem[] =
    await AgentTablesQueryConfigurationTable.count({
      where: {
        // /!\ `dataSourceId` is the data source's name, not the id.
        // @ts-expect-error `dataSourceId` has been removed.
        dataSourceId: dataSources.map((ds) => ds.name),
        dataSourceIdNew: {
          [Op.is]: null,
        },
        // Given that the name isn't unique we need to count per workspace.
        dataSourceWorkspaceId: workspace.sId,
      },
    });

  logger.info(
    `About to update ${agentTablesQueryConfigurationsCount} agent tables query configurations for workspace(${workspace.sId}).`
  );

  if (!execute) {
    return;
  }

  for (const ds of dataSources) {
    const dataSourceViewsForDataSource = dataSourceViews.filter(
      (dsv) => dsv.dataSourceId === ds.id
    );
    assert(
      dataSourceViewsForDataSource.length === 1,
      `Error while fetching data source view for data source ${ds.id} // Found ${dataSourceViewsForDataSource.length} data source views.`
    );

    await AgentTablesQueryConfigurationTable.update(
      // Upsert both `dataSourceIdNew` and `dataSourceViewId` to ensure consistency.
      {
        dataSourceIdNew: ds.id,
        dataSourceViewId: dataSourceViewsForDataSource[0].id,
      },
      {
        where: {
          // /!\ `dataSourceId` is the data source's name, not the id.
          // @ts-expect-error `dataSourceId` has been removed.
          dataSourceId: ds.name,
          dataSourceIdNew: {
            [Op.is]: null,
          },
          // Given that the name isn't unique we need to precise the workspace.
          dataSourceWorkspaceId: workspace.sId,
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
    await backfillDataSourceIdInAgentTableQueryConfigurationForWorkspace(
      workspace,
      logger,
      execute
    );

    logger.info(
      `Finished backfilling "dataSourceIdNew" for workspace(${workspace.sId}).`
    );
  });
});
