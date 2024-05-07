import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const decrementAgentConfigTool = async (execute: boolean) => {
  const queryStr = `
  UPDATE agent_configurations
  SET "maxToolsUsePerRun" =  "maxToolsUsePerRun" - 1
  WHERE "maxToolsUsePerRun" <= 2`;
  if (execute) {
    const res = await frontSequelize.query(queryStr, {
      type: QueryTypes.UPDATE,
    });
    logger.info({ count: res[1] }, "Updated agent configurations");
  }
};

makeScript({}, async ({ execute }) => {
  await decrementAgentConfigTool(execute);
});
