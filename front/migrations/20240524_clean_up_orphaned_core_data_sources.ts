// import { CoreAPI } from "@dust-tt/types";

// import config from "@app/lib/api/config";
// import logger from "@app/logger/logger";
// import { launchScrubDataSourceWorkflow } from "@app/poke/temporal/client";
// import { makeScript } from "@app/scripts/helpers";

// const ORPHANED_DATA_SOURCES: { project: string; data_source_id: string }[] = [
//   // add orphaned data sources here
// ];

// makeScript({}, async ({ execute }) => {
//   if (execute) {
//     for (const { project, data_source_id } of ORPHANED_DATA_SOURCES) {
//       const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
//       const coreDeleteRes = await coreAPI.deleteDataSource({
//         projectId: project,
//         dataSourceId: data_source_id,
//       });
//       if (coreDeleteRes.isErr()) {
//         console.log("ERROR:" + coreDeleteRes.error);
//       }

//       await launchScrubDataSourceWorkflow({
//         wId: "scrub_orphaned",
//         dustAPIProjectId: project,
//       });
//     }
//   }
// });
