// import { CoreAPI } from "@dust-tt/types";
// import { Sequelize } from "sequelize";

// import config from "@app/lib/api/config";
// import { Workspace } from "@app/lib/models/workspace";
// import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
// import logger from "@app/logger/logger";
// import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";

// const { CORE_DATABASE_URI, LIVE } = process.env;

// async function main() {
//   if (!CORE_DATABASE_URI) {
//     throw new Error("CORE_DATABASE_URI is not defined");
//   }

//   const coreSequelize = new Sequelize(CORE_DATABASE_URI, { logging: false });

//   const dataSources = await DataSourceModel.findAll({});
//   console.log(`Processing ${dataSources.length} data sources.`);

//   let countDeleted = 0;

//   for (const ds of dataSources) {
//     const dustAPIProjectId = ds.dustAPIProjectId;

//     /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
//     const [dsData, dsMetaData] = (await coreSequelize.query(`
//       SELECT * FROM data_sources WHERE project = ${dustAPIProjectId};
//     `)) as [any[], { rowCount?: number }];

//     if (dsData.length == 0) {
//       console.log(`[!] CORE Data Source Not Found: ${dustAPIProjectId}`);
//       continue;
//     }
//     if (dsData.length > 1) {
//       console.log(`[!] CORE Data Source Found >1: ${dustAPIProjectId}`);
//       continue;
//     }

//     /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
//     const [docData, docMetaData] = (await coreSequelize.query(`
//       SELECT * FROM data_sources_documents WHERE data_source = ${dsData[0].id} AND status='latest' LIMIT 1;
//     `)) as [any[], { rowCount?: number }];

//     const is2DayOld =
//       ds.createdAt < new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

//     /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
//     const [databaseData, databaseMetaData] = (await coreSequelize.query(`
//       SELECT * FROM tables WHERE data_source = ${dsData[0].id} LIMIT 1;
//     `)) as [any[], { rowCount?: number }];

//     if (
//       docData.length === 0 &&
//       databaseData.length === 0 &&
//       !ds.connectorId &&
//       is2DayOld
//     ) {
//       countDeleted += 1;
//       console.log(
//         `[DELETE] Data Source: ${dustAPIProjectId} ${ds.id} ${ds.name} ${dsData[0].internal_id}`
//       );
//       if (LIVE) {
//         const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
//         const coreDeleteRes = await coreAPI.deleteDataSource({
//           projectId: dustAPIProjectId,
//           dataSourceId: ds.dustAPIDataSourceId,
//         });
//         if (coreDeleteRes.isErr()) {
//           console.log("[x] Error deleting CoreAPI data source", ds);
//           throw new Error(
//             `Error deleting core data source: ${coreDeleteRes.error.message}`
//           );
//         }

//         console.log("[i] Data Source destroyed");
//         await ds.destroy();

//         const workspace = await Workspace.findOne({
//           where: {
//             id: ds.workspaceId,
//           },
//         });

//         if (!workspace) {
//           throw new Error(`Workspace not found: ${ds.workspaceId}`);
//         }

//         console.log(
//           "Launching scrub workflow",
//           workspace.sId,
//           dustAPIProjectId
//         );

//         await launchScrubDataSourceWorkflow({
//           wId: workspace.sId,
//           dustAPIProjectId,
//         });
//       }
//     }
//   }

//   console.log(`Deleted ${countDeleted} data sources.`);
// }

// main()
//   .then(() => {
//     console.log("Done");
//     process.exit(0);
//   })
//   .catch((err) => {
//     console.error(err);
//     process.exit(1);
//   });
