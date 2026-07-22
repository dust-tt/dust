// import {
//   SkillConfigurationModel,
//   SkillVersionModel,
// } from "@app/lib/models/skill";
// import { makeScript } from "@app/scripts/helpers";
// import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
// import { availabilityFromIsDefault } from "@app/types/assistant/skill_configuration";
// import type { ModelStatic } from "sequelize";
//
// const WORKSPACE_CONCURRENCY = 16;
//
// // Transition (isDefault -> availability): rows written by code predating the availability column
// // have a NULL availability and an authoritative isDefault. Run this once all pods write the
// // availability column (post-deploy), so no row can be updated by old code afterwards.
// const MODELS: {
//   table: string;
//   model: ModelStatic<SkillConfigurationModel>;
// }[] = [
//   { table: "skill_configurations", model: SkillConfigurationModel },
//   { table: "skill_versions", model: SkillVersionModel },
// ];
//
// makeScript({}, async ({ execute }, logger) => {
//   let totalUpdated = 0;
//
//   await runOnAllWorkspaces(
//     async (workspace) => {
//       for (const { table, model } of MODELS) {
//         if (!execute) {
//           const wouldUpdateCount = await model.count({
//             where: { workspaceId: workspace.id, availability: null },
//           });
//
//           if (wouldUpdateCount > 0) {
//             logger.info(
//               { workspaceId: workspace.sId, table, wouldUpdateCount },
//               "Dry run: would backfill availability from isDefault"
//             );
//           }
//           continue;
//         }
//
//         let updated = 0;
//         for (const isDefault of [true, false]) {
//           // The `availability: null` guard makes the script safe to re-run and keeps rows
//           // already written by new code untouched. `silent` leaves updatedAt untouched.
//           const [count] = await model.update(
//             { availability: availabilityFromIsDefault(isDefault) },
//             {
//               where: {
//                 workspaceId: workspace.id,
//                 availability: null,
//                 isDefault,
//               },
//               silent: true,
//             }
//           );
//           updated += count;
//         }
//
//         if (updated > 0) {
//           totalUpdated += updated;
//           logger.info(
//             { workspaceId: workspace.sId, table, updated },
//             "Backfilled skill availability"
//           );
//         }
//       }
//     },
//     { concurrency: WORKSPACE_CONCURRENCY }
//   );
//
//   logger.info({ totalUpdated }, "Completed skill availability backfill");
// });
