// import { CoreAPI } from "@dust-tt/types";
// import { Sequelize } from "sequelize";

// import config from "@app/lib/api/config";
// import { DataSourceResource } from "@app/lib/resources/data_source_resource";
// import logger from "@app/logger/logger";
// import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";
// import { makeScript } from "@app/scripts/helpers";

// const { CORE_DATABASE_URI } = process.env;

// makeScript({}, async ({ execute }) => {
//   const corePrimary = new Sequelize(CORE_DATABASE_URI as string, {
//     logging: false,
//   });

//   const coreData = await corePrimary.query(
//     `SELECT id, project, data_source_id, internal_id FROM data_sources`
//   );

//   const coreDataSources = coreData[0] as {
//     id: number;
//     project: number;
//     data_source_id: string;
//     internal_id: string;
//   }[];

//   const frontDataSources = await DataSourceResource.model.findAll({});

//   logger.info(
//     {
//       coreDataSources: coreDataSources.length,
//       frontDataSources: frontDataSources.length,
//     },
//     "Retrieved data sources"
//   );

//   const frontDataSourcesById = frontDataSources.reduce(
//     (acc, ds) => {
//       acc[`${ds.dustAPIProjectId}-${ds.dustAPIDataSourceId}`] = ds;
//       return acc;
//     },
//     {} as Record<string, (typeof frontDataSources)[0]>
//   );

//   for (const coreDataSource of coreDataSources) {
//     if (
//       !frontDataSourcesById[
//         `${coreDataSource.project}-${coreDataSource.data_source_id}`
//       ]
//     ) {
//       const coreData: any = await corePrimary.query(
//         `SELECT COUNT(*) FROM data_sources_documents WHERE data_source=${coreDataSource.id}`
//       );

//       logger.info(
//         {
//           coreDataSource,
//           coreDocuments: coreData[0][0]["count"],
//         },
//         "Found orphaned core data source"
//       );

//       if (execute) {
//         const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
//         const coreDeleteRes = await coreAPI.deleteDataSource({
//           projectId: `${coreDataSource.project}`,
//           dataSourceId: coreDataSource.data_source_id,
//         });
//         if (coreDeleteRes.isErr()) {
//           logger.error(
//             {
//               coreDeleteRes,
//             },
//             "Failed to delete core data source"
//           );
//           return;
//         }

//         await launchScrubDataSourceWorkflow({
//           wId: "scrub_orphaned",
//           dustAPIProjectId: `${coreDataSource.project}`,
//         });
//       }
//     }
//   }
// });
