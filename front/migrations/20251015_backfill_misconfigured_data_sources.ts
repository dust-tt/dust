import * as fs from "fs";
import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

const UPDATE_CONCURRENCY = 10;

makeScript({}, async ({ execute }, logger) => {
  let revertSql = "";

  logger.info("Starting migration of AgentDataSourceConfiguration parentsIn");

  const dataSourceConfigurations = await AgentDataSourceConfiguration.findAll({
    where: {
      parentsIn: [],
      parentsNotIn: { [Op.not]: null },
    },
  });

  logger.info(
    `Found ${dataSourceConfigurations.length} configurations to process`
  );

  await concurrentExecutor(
    dataSourceConfigurations,
    async (configuration) => {
      revertSql += `UPDATE "agent_data_source_configurations" SET "parentsIn" = '{}' WHERE "id" = ${configuration.id};\n`;

      if (execute) {
        await configuration.update({
          parentsIn: null,
        });
        logger.info({ rowId: configuration.id }, "Updated parentsIn to null");
      } else {
        logger.info(
          { rowId: configuration.id },
          "Would update parentsIn to null (dry run)"
        );
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
    `Migration completed. Processed ${dataSourceConfigurations.length} configurations`
  );
});
