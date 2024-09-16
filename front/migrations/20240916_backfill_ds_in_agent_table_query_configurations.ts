import type { LightWorkspaceType } from "@dust-tt/types";
import { Op } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
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

  // Count agent tables query configurations that uses those data sources and have no dataSourceIdNew.
  const agentTablesQueryConfigurationsCount =
    await AgentTablesQueryConfigurationTable.count({
      where: {
        // /!\ `dataSourceId` is the data source's name, not the id.
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
    await AgentTablesQueryConfigurationTable.update(
      { dataSourceIdNew: ds.id },
      {
        where: {
          // /!\ `dataSourceId` is the data source's name, not the id.
          dataSourceId: ds.name,
          dataSourceIdNew: {
            [Op.is]: null,
          },
          // Given that the name isn't unique we need precise the workspace.
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
