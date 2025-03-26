// import { assertNever, removeNulls } from "@app/types";
// import * as _ from "lodash";

// import { AgentDustAppRunConfiguration } from "@app/lib/models/assistant/actions/dust_app_run";
// import { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
// import { AgentTablesQueryConfiguration } from "@app/lib/models/assistant/actions/tables_query";
// import {
//   AgentConfiguration,
//   AgentGenerationConfiguration,
// } from "@app/lib/models/assistant/agent";
// import logger from "@app/logger/logger";
// import { makeScript } from "@app/scripts/helpers";

// // Fetch all agents, with all generation configs and all actions.
// // Goal is to backfill forceUseAtIteration for all generations and actions.
// // If there is an action, its forceUseAtIteration will be 0 and the generation's will be 1.
// // If there is no action, the generation's will be 0.

// const backfillAgentConfigurations = async (execute: boolean) => {
//   const generations = await AgentGenerationConfiguration.findAll();
//   const generationConfigsByAgentId: Record<
//     number,
//     AgentGenerationConfiguration[]
//   > = _.groupBy(generations, "agentConfigurationId");

//   const retrievalConfigs = await AgentRetrievalConfiguration.findAll();
//   const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll();
//   const dustAppRunConfigs = await AgentDustAppRunConfiguration.findAll();

//   const actionsByAgentId: Record<
//     number,
//     (
//       | AgentRetrievalConfiguration
//       | AgentDustAppRunConfiguration
//       | AgentTablesQueryConfiguration
//     )[]
//   > = _.groupBy(
//     [...retrievalConfigs, ...dustAppRunConfigs, ...tablesQueryConfigs],
//     (action) => action.agentConfigurationId
//   );

//   const allAgentIds: number[] = Array.from(
//     new Set<number>([
//       ...removeNulls(Object.keys(actionsByAgentId).map(Number)),
//       ...removeNulls(Object.keys(generationConfigsByAgentId)).map(Number),
//     ])
//   );

//   const chunks = _.chunk(allAgentIds, 16);

//   for (const c of chunks) {
//     for (const aId of c) {
//       const generations = generationConfigsByAgentId[aId] ?? [];
//       const actions = actionsByAgentId[aId] ?? [];
//       if (generations.length > 1) {
//         throw new Error("Unreachable: agent has multiple generations");
//       }
//       logger.info(
//         `Backfilling max tools use per run for agent ${aId}... [execute: ${execute}]`
//       );
//       if (execute) {
//         const nbFixedIterations = (generations.length ? 1 : 0) + actions.length;
//         await AgentConfiguration.update(
//           { maxToolsUsePerRun: nbFixedIterations },
//           {
//             where: {
//               id: aId,
//             },
//           }
//         );
//       }
//       if (!generations.length) {
//         logger.info(
//           `Skipping forceUseAtIteration backfill for agent ${aId} (no generation configuration)`
//         );
//         continue;
//       }
//       if (actions.length > 1) {
//         logger.info(
//           `Skipping forceUseAtIteration backfill for agent ${aId} (multiple actions)`
//         );
//         continue;
//       }
//       let forceUseAtIteration = 0;
//       if (actions.length) {
//         const action = actions[0];
//         if (action instanceof AgentRetrievalConfiguration) {
//           logger.info(
//             `Backfilling retrieval action ${action.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
//           );
//           if (execute) {
//             await AgentRetrievalConfiguration.update(
//               { forceUseAtIteration },
//               {
//                 where: {
//                   id: action.id,
//                 },
//               }
//             );
//           }
//         } else if (action instanceof AgentDustAppRunConfiguration) {
//           logger.info(
//             `Backfilling dust app run action ${action.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
//           );
//           if (execute) {
//             await AgentDustAppRunConfiguration.update(
//               { forceUseAtIteration },
//               {
//                 where: {
//                   id: action.id,
//                 },
//               }
//             );
//           }
//         } else if (action instanceof AgentTablesQueryConfiguration) {
//           logger.info(
//             `Backfilling tables query action ${action.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
//           );
//           if (execute) {
//             await AgentTablesQueryConfiguration.update(
//               { forceUseAtIteration },
//               {
//                 where: {
//                   id: action.id,
//                 },
//               }
//             );
//           }
//         } else {
//           assertNever(action);
//         }

//         forceUseAtIteration += 1;
//       }
//       const generation = generations[0];
//       logger.info(
//         `Backfilling generation configuration ${generation.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
//       );
//       if (execute) {
//         await AgentGenerationConfiguration.update(
//           { forceUseAtIteration },
//           {
//             where: {
//               id: generation.id,
//             },
//           }
//         );
//       }
//     }
//   }
// };

// makeScript({}, async ({ execute }) => {
//   await backfillAgentConfigurations(execute);
// });
