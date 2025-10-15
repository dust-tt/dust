import * as fs from "fs";
import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

const UPDATE_CONCURRENCY = 10;

makeScript({}, async ({ execute }, logger) => {
  let revertSql = "";

  logger.info("Starting migration of AgentDataSourceConfiguration parentsIn");

  const configurations = await AgentDataSourceConfiguration.findAll({
    where: {
      parentsIn: [],
      parentsNotIn: { [Op.not]: null },
    },
  });

  logger.info(`Found ${configurations.length} configurations to process`);

  await concurrentExecutor(
    configurations,
    async (config) => {
      const configLogger = logger.child({ configId: config.id });

      // Generate revert SQL for this configuration
      revertSql += `UPDATE "agent_data_source_configurations" SET "parentsIn" = '{}' WHERE "id" = ${config.id};\n`;

      if (execute) {
        await config.update({
          parentsIn: null,
        });
        configLogger.info("Updated parentsIn to null", {
          oldParentsIn: config.parentsIn,
          parentsNotIn: config.parentsNotIn,
        });
      } else {
        configLogger.info("Would update parentsIn to null (dry run)", {
          oldParentsIn: config.parentsIn,
          parentsNotIn: config.parentsNotIn,
        });
      }
    },
    { concurrency: UPDATE_CONCURRENCY }
  );

  if (execute && revertSql) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const revertFileName = `revert_agent_data_source_config_parents_${timestamp}.sql`;
    fs.writeFileSync(revertFileName, revertSql);
    logger.info(`Revert SQL written to ${revertFileName}`);
  }

  logger.info(
    `Migration completed. Processed ${configurations.length} configurations`
  );
});
