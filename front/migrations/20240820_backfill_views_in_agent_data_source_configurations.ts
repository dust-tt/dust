// import type { LightWorkspaceType } from "@dust-tt/types";
// import assert from "assert";
// import { Op } from "sequelize";
//
// import { Authenticator } from "@app/lib/auth";
// import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
// import { DataSourceResource } from "@app/lib/resources/data_source_resource";
// import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
// import { SpaceResource } from "@app/lib/resources/vault_resource";
// import type { Logger } from "@app/logger/logger";
// import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";
//
// async function backfillViewsInAgentDataSourceConfigurationForWorkspace(
//   workspace: LightWorkspaceType,
//   logger: Logger,
//   execute: boolean
// ) {
//   const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
//
//   // List workspace data sources.
//   const dataSources = await DataSourceResource.listByWorkspace(auth);
//
//   logger.info(
//     `Found ${dataSources.length} data sources for workspace(${workspace.sId}).`
//   );
//
//   const globalVault = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
//
//   // Retrieve data source views for data sources.
//   const dataSourceViews =
//     await DataSourceViewResource.listForDataSourcesInSpace(
//       auth,
//       dataSources,
//       globalVault
//     );
//
//   // Count agent data source configurations that uses those data sources and have no dataSourceViewId.
//
//   const agentDataSourceConfigurationsCount =
//     await AgentDataSourceConfiguration.count({
//       where: {
//         dataSourceId: dataSources.map((ds) => ds.id),
//         dataSourceViewId: {
//           [Op.is]: null,
//         },
//       },
//     });
//
//   logger.info(
//     `About to update ${agentDataSourceConfigurationsCount} agent data source configurations for workspace(${workspace.sId}).`
//   );
//
//   if (!execute) {
//     return;
//   }
//
//   for (const ds of dataSources) {
//     const dataSourceView = dataSourceViews.find(
//       (dsv) => dsv.dataSourceId === ds.id
//     );
//     assert(
//       dataSourceView,
//       `Data source view not found for data source ${ds.id}.`
//     );
//
//     await AgentDataSourceConfiguration.update(
//       { dataSourceViewId: dataSourceView.id },
//       {
//         where: {
//           dataSourceId: ds.id,
//         },
//       }
//     );
//
//     logger.info(
//       `Updated agent data source configuration for data source ${ds.id}.`
//     );
//   }
//
//   logger.info(
//     `Updated all agent data source configurations for workspace(${workspace.sId}).`
//   );
// }
//
// makeScript({}, async ({ execute }, logger) => {
//   return runOnAllWorkspaces(async (workspace) => {
//     await backfillViewsInAgentDataSourceConfigurationForWorkspace(
//       workspace,
//       logger,
//       execute
//     );
//
//     logger.info(`Finished backfilling views for workspace(${workspace.sId}).`);
//   });
// });
