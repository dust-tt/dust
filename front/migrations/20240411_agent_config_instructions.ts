import {
  AgentConfiguration,
  AgentGenerationConfiguration,
} from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillAgentConfiguration = async (
  agent: AgentConfiguration,
  execute: boolean
): Promise<void> => {
  const genConfigs = await AgentGenerationConfiguration.findAll({
    where: {
      id: agent.id,
    },
    attributes: ["prompt"],
  });

  if (genConfigs.length > 1) {
    throw new Error(
      "Unexpected: legacy migration in which there could not be multiple generation configurations per agent"
    );
  }

  if (genConfigs.length === 0) {
    logger.info(`Skipping agent (no generation configuration) ${agent.id}`);
    return;
  }

  const prompt = genConfigs[0].prompt;
  if (!prompt) {
    logger.info(`Skipping agent (no generation configuration) ${agent.id}`);
    return;
  }

  if (execute) {
    await agent.update({
      instructions: prompt,
    });
  }
};

const backfillAgentConfigurations = async (execute: boolean) => {
  // Fetch all agents that have no instructions
  const agents = await AgentConfiguration.findAll({
    where: {
      instructions: null,
    },
  });

  // Split agents into chunks of 16
  const chunks: AgentConfiguration[][] = [];
  for (let i = 0; i < agents.length; i += 16) {
    chunks.push(agents.slice(i, i + 16));
  }

  // Process each chunk in parallel
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await Promise.all(
      chunk.map(async (agent) => {
        return backfillAgentConfiguration(agent, execute);
      })
    );
  }
};

makeScript({}, async ({ execute }) => {
  await backfillAgentConfigurations(execute);
});
