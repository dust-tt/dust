import { Op } from "sequelize";

import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types";

const updateAllAgentMaxSteps = async (execute: boolean) => {
  const agentConfigurations = await AgentConfigurationModel.findAll({
    where: {
      maxStepsPerRun: { [Op.lt]: MAX_STEPS_USE_PER_RUN_LIMIT },
      status: "active",
    },
  });

  logger.info(
    { count: agentConfigurations.length },
    execute
      ? `Updating ${agentConfigurations.length} agent configurations to maxStepsPerRun=${MAX_STEPS_USE_PER_RUN_LIMIT}`
      : `Would update ${agentConfigurations.length} agent configurations to maxStepsPerRun=${MAX_STEPS_USE_PER_RUN_LIMIT}`
  );

  if (execute) {
    let updated = 0;
    for (const agentConfig of agentConfigurations) {
      agentConfig.maxStepsPerRun = MAX_STEPS_USE_PER_RUN_LIMIT;
      await agentConfig.save();
      updated++;

      if (updated % 100 === 0) {
        logger.info(
          { updated },
          `Progress: updated ${updated} agent configurations`
        );
      }
    }

    logger.info(
      { updated },
      `Completed: updated all ${updated} agent configurations to maxStepsPerRun=${MAX_STEPS_USE_PER_RUN_LIMIT}`
    );
  }
};

makeScript({}, async ({ execute }) => {
  await updateAllAgentMaxSteps(execute);
});
