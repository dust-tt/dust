// Migration created on Jan 08, 2026
// Phase 2 of doc-tracker removal: Delete all tracker data
// This migration was run before Phase 3 (removing all tracker code) was deployed.
// Commented out as the tracker models no longer exist.

// import {
//   TrackerConfigurationModel,
//   TrackerDataSourceConfigurationModel,
//   TrackerGenerationModel,
// } from "@app/lib/models/doc_tracker";
// import logger from "@app/logger/logger";
// import { makeScript } from "@app/scripts/helpers";

// makeScript({}, async ({ execute }) => {
//   // Count records to be deleted
//   const generationsCount = await TrackerGenerationModel.count();
//   const dataSourceConfigsCount =
//     await TrackerDataSourceConfigurationModel.count();
//   const configurationsCount = await TrackerConfigurationModel.count();

//   logger.info(
//     {
//       generationsCount,
//       dataSourceConfigsCount,
//       configurationsCount,
//     },
//     "Tracker data to delete"
//   );

//   if (
//     generationsCount === 0 &&
//     dataSourceConfigsCount === 0 &&
//     configurationsCount === 0
//   ) {
//     logger.info("No tracker data to delete");
//     return;
//   }

//   if (!execute) {
//     logger.info("Dry run - no data deleted. Use --execute to delete data.");
//     return;
//   }

//   // Delete in order respecting foreign key constraints
//   logger.info("Deleting tracker_generations...");
//   const deletedGenerations = await TrackerGenerationModel.destroy({
//     where: {},
//     hardDelete: true,
//   });
//   logger.info({ deletedGenerations }, "Deleted tracker_generations");

//   logger.info("Deleting tracker_data_source_configurations...");
//   const deletedDataSourceConfigs =
//     await TrackerDataSourceConfigurationModel.destroy({
//       where: {},
//       hardDelete: true,
//     });
//   logger.info(
//     { deletedDataSourceConfigs },
//     "Deleted tracker_data_source_configurations"
//   );

//   logger.info("Deleting tracker_configurations...");
//   const deletedConfigurations = await TrackerConfigurationModel.destroy({
//     where: {},
//     hardDelete: true,
//   });
//   logger.info({ deletedConfigurations }, "Deleted tracker_configurations");

//   logger.info(
//     {
//       deletedGenerations,
//       deletedDataSourceConfigs,
//       deletedConfigurations,
//     },
//     "All tracker data deleted"
//   );
// });
