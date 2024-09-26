// import type { LightWorkspaceType } from "@dust-tt/types";
// import { removeNulls } from "@dust-tt/types";
// import assert from "assert";
// import { pick, uniqBy } from "lodash";
// import { Op } from "sequelize";
//
// import { Authenticator } from "@app/lib/auth";
// import { RetrievalDocument } from "@app/lib/models/assistant/actions/retrieval";
// import { DataSourceResource } from "@app/lib/resources/data_source_resource";
// import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
// import { VaultResource } from "@app/lib/resources/vault_resource";
// import type { Logger } from "@app/logger/logger";
// import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";
//
// async function backfillViewsInRetrievalDocumentsForWorkspace(
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
//   const globalVault = await VaultResource.fetchWorkspaceGlobalVault(auth);
//
//   // Retrieve data source views for data sources.
//   const dataSourceViews =
//     await DataSourceViewResource.listForDataSourcesInVault(
//       auth,
//       dataSources,
//       globalVault
//     );
//
//   const uniqueDataSources = removeNulls(
//     dataSourceViews.map((dsv) => dsv.dataSource)
//   );
//
//   // Count retrieval documents that uses those data sources and have no dataSourceViewId.
//   const retrievalDocumentsCount = await RetrievalDocument.count({
//     where: {
//       // /!\ `dataSourceId` is the data source's name, not the id.
//       dataSourceId: {
//         [Op.in]: uniqueDataSources.map((ds) => ds.name),
//       },
//       // Scope to data sources that belong to the workspace.
//       dataSourceWorkspaceId: workspace.sId,
//       dataSourceViewId: {
//         [Op.is]: null,
//       },
//     },
//   });
//
//   logger.info(
//     `About to update ${retrievalDocumentsCount} retrieval documents for workspace(${workspace.sId}).`
//   );
//
//   if (!execute) {
//     return;
//   }
//
//   for (const ds of uniqueDataSources) {
//     const dataSourceView = dataSourceViews.find(
//       (dsv) => dsv.dataSourceId === ds.id
//     );
//     assert(
//       dataSourceView,
//       `Data source view not found for data source ${ds.id}.`
//     );
//
//     await RetrievalDocument.update(
//       { dataSourceViewId: dataSourceView.id },
//       {
//         where: {
//           // /!\ `dataSourceId` is the data source's name, not the id.
//           dataSourceId: ds.name,
//           // Scope to data sources that belong to the workspace.
//           dataSourceWorkspaceId: workspace.sId,
//         },
//       }
//     );
//
//     logger.info(
//       `Updated retrieval documents for data source ${ds.id}-${ds.name}.`
//     );
//   }
//
//   logger.info(
//     `Updated all retrieval documents for workspace(${workspace.sId}).`
//   );
// }
//
// makeScript({}, async ({ execute }, logger) => {
//   return runOnAllWorkspaces(async (workspace) => {
//     await backfillViewsInRetrievalDocumentsForWorkspace(
//       workspace,
//       logger,
//       execute
//     );
//
//     logger.info(`Finished backfilling views for workspace(${workspace.sId}).`);
//   });
// });
