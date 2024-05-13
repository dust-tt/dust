// // import type { ModelIdType, ModelProviderIdType } from "@dust-tt/types";
// // import { isModelId, isModelProviderId } from "@dust-tt/types";

// import {
//   AgentConfiguration,
//   AgentGenerationConfiguration,
// } from "@app/lib/models/assistant/agent";
// import logger from "@app/logger/logger";
// import { makeScript } from "@app/scripts/helpers";

// const backfillAgentConfiguration = async (
//   agent: AgentConfiguration,
//   execute: boolean
// ): Promise<void> => {
//   const genConfigs = await AgentGenerationConfiguration.findAll({
//     where: {
//       agentConfigurationId: agent.id,
//     },
//     attributes: ["id", "providerId", "modelId", "temperature"],
//   });

//   if (genConfigs.length > 1) {
//     throw new Error(
//       "Unexpected: legacy migration in which there could not be multiple generation configurations per agent"
//     );
//   }

//   if (genConfigs.length === 0) {
//     logger.info(
//       `Skipping agent (no generation configuration) ${agent.id}. --execute: ${execute}`
//     );
//     return;
//   }

//   // const [generation] = genConfigs;

//   // if (!isModelProviderId(generation.providerId)) {
//   //   throw new Error(
//   //     `Invalid Provider Id for agent ${generation.id}:${generation.providerId}).`
//   //   );
//   // }

//   // if (!isModelId(generation.modelId)) {
//   //   throw new Error(
//   //     `Invalid Provider Id for agent ${generation.id}:${generation.modelId}).`
//   //   );
//   // }

//   // logger.info(
//   //   `Updating agent ${agent.id} from generation configuration ${generation.id}. --execute: ${execute}`
//   // );

//   if (execute) {
//     // await agent.update({
//     //   modelId: generation.modelId as ModelIdType,
//     //   providerId: generation.providerId as ModelProviderIdType,
//     //   temperature: generation.temperature,
//     // });
//   }
// };

// const backfillAgentConfigurations = async (execute: boolean) => {
//   // Fetch all agents that have no instructions
//   const agents = await AgentConfiguration.findAll({});

//   // Split agents into chunks of 16
//   const chunks: AgentConfiguration[][] = [];
//   for (let i = 0; i < agents.length; i += 16) {
//     chunks.push(agents.slice(i, i + 16));
//   }

//   // Process each chunk in parallel
//   for (let i = 0; i < chunks.length; i++) {
//     const chunk = chunks[i];
//     await Promise.all(
//       chunk.map(async (agent) => {
//         return backfillAgentConfiguration(agent, execute);
//       })
//     );
//   }
// };

// makeScript({}, async ({ execute }) => {
//   throw new Error("This migration is deprecated and should not be run.");
//   await backfillAgentConfigurations(execute);
// });
