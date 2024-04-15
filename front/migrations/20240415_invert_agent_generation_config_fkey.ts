import * as _ from "lodash";

import {
  AgentConfiguration,
  AgentGenerationConfiguration,
} from "@app/lib/models/assistant/agent";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillGenerationConfigs = async (execute: boolean) => {
  const generationConfigs = await AgentGenerationConfiguration.findAll({
    where: {
      agentConfigurationId: null,
    },
  });

  logger.info(
    `Found ${generationConfigs.length} retrieval configurations without agent configuration`
  );

  for (const chunk of _.chunk(generationConfigs, 16)) {
    await Promise.all(
      chunk.map(async (g) => {
        const agent = await AgentConfiguration.findOne({
          where: {
            generationConfigurationId: g.id,
          },
        });
        if (!agent) {
          logger.warn(
            `No agent found for retrieval configuration ${g.id}, destroying it`
          );
          if (execute) {
            await g.destroy();
          }
          return;
        }
        logger.info(
          `Backfilling generation configuration ${g.id} with \`agentConfigurationId=${agent.id}\` [execute: ${execute}]`
        );
        if (execute) {
          await g.update({ agentConfigurationId: agent.id });
        }
      })
    );
  }
};

makeScript({}, async ({ execute }) => {
  await backfillGenerationConfigs(execute);
});
