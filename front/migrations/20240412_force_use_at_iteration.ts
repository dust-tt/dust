import { assertNever } from "@dust-tt/types";
import * as _ from "lodash";

import { AgentConfiguration } from "@app/lib/models";
import {
  AgentDustAppRunConfiguration,
  AgentRetrievalConfiguration,
  AgentTablesQueryConfiguration,
} from "@app/lib/models";
import { AgentGenerationConfiguration } from "@app/lib/models";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

// Fetch all agents, with all generation configs and all actions.
// Goal is to backfill forceUseAtIteration for all generations and actions.
// If there is an action, its forceUseAtIteration will be 0 and the generation's will be 1.
// If there is no action, the generation's will be 0.

const backfillAgentConfigurations = async (execute: boolean) => {
  const agents = await AgentConfiguration.findAll({
    include: [
      {
        model: AgentGenerationConfiguration,
        as: "generationConfiguration",
      },
    ],
  });
  const generationConfigByAgentId: Record<
    number,
    AgentGenerationConfiguration
  > = {};
  for (const agent of agents) {
    generationConfigByAgentId[agent.id] = agent.generationConfiguration;
  }

  const retrievalConfigs = await AgentRetrievalConfiguration.findAll();
  const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll();
  const dustAppRunConfigs = await AgentDustAppRunConfiguration.findAll();

  const actionsByAgentId: Record<
    number,
    (
      | AgentRetrievalConfiguration
      | AgentDustAppRunConfiguration
      | AgentTablesQueryConfiguration
    )[]
  > = _.groupBy(
    [...retrievalConfigs, ...dustAppRunConfigs, ...tablesQueryConfigs],
    (action) => action.agentConfigurationId
  );

  const allAgentIds: number[] = Array.from(
    new Set<number>([
      ...Object.keys(actionsByAgentId).map(Number),
      ...Object.keys(generationConfigByAgentId).map(Number),
    ])
  );

  const chunks = _.chunk(allAgentIds, 16);

  for (const c of chunks) {
    for (const aId of c) {
      const generation = generationConfigByAgentId[aId];
      const actions = actionsByAgentId[aId] ?? [];
      if (!generation) {
        logger.info(`Skipping agent (no generation configuration) ${aId}`);
        continue;
      }
      if (actions.length > 1) {
        logger.info("Agent has multiple actions, skipping");
        continue;
      }
      let forceUseAtIteration = 0;
      if (actions.length) {
        const action = actions[0];
        if (action instanceof AgentRetrievalConfiguration) {
          logger.info(
            `Backfilling retrieval action ${action.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
          );
          if (execute) {
            await AgentRetrievalConfiguration.update(
              { forceUseAtIteration },
              {
                where: {
                  id: action.id,
                },
              }
            );
          }
        } else if (action instanceof AgentDustAppRunConfiguration) {
          logger.info(
            `Backfilling dust app run action ${action.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
          );
          if (execute) {
            await AgentDustAppRunConfiguration.update(
              { forceUseAtIteration },
              {
                where: {
                  id: action.id,
                },
              }
            );
          }
        } else if (action instanceof AgentTablesQueryConfiguration) {
          logger.info(
            `Backfilling tables query action ${action.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
          );
          if (execute) {
            await AgentTablesQueryConfiguration.update(
              { forceUseAtIteration },
              {
                where: {
                  id: action.id,
                },
              }
            );
          }
        } else {
          assertNever(action);
        }

        forceUseAtIteration += 1;
      }

      logger.info(
        `Backfilling generation configuration ${generation.id} for agent ${aId} with forceUseAtIteration... [execute: ${execute}]`
      );
      if (execute) {
        await AgentGenerationConfiguration.update(
          { forceUseAtIteration },
          {
            where: {
              id: generation.id,
            },
          }
        );
      }
    }
  }
};

makeScript({}, async ({ execute }) => {
  await backfillAgentConfigurations(execute);
});
