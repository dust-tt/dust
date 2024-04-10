import * as _ from "lodash";

import {
  AgentConfiguration,
  AgentDustAppRunConfiguration,
  AgentRetrievalConfiguration,
  AgentTablesQueryConfiguration,
} from "@app/lib/models";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

const backfillActionConfigs = async (execute: boolean) => {
  const retrievalConfigs = await AgentRetrievalConfiguration.findAll({
    // @ts-expect-error agentConfigurationId is marked as required in the model, but we are looking for null values
    where: {
      agentConfigurationId: null,
    },
  });

  logger.info(
    `Found ${retrievalConfigs.length} retrieval configurations without agent configuration`
  );

  for (const chunk of _.chunk(retrievalConfigs, 16)) {
    await Promise.all(
      chunk.map(async (rc) => {
        const agent = await AgentConfiguration.findOne({
          where: {
            retrievalConfigurationId: rc.id as number,
          },
        });
        if (!agent) {
          logger.warn(`No agent found for retrieval configuration ${rc.id}`);
          return;
        }
        logger.info(
          `Backfilling retrieval configuration ${rc.id} with \`agentConfigurationId=${agent.id}\` [execute: ${execute}]`
        );
        if (execute) {
          await rc.update({ agentConfigurationId: agent.id });
        }
      })
    );
  }

  const tablesQueryConfigs = await AgentTablesQueryConfiguration.findAll({
    // @ts-expect-error agentConfigurationId is marked as required in the model, but we are looking for null values
    where: {
      agentConfigurationId: null,
    },
  });

  logger.info(
    `Found ${tablesQueryConfigs.length} tables query configurations without agent configuration`
  );

  for (const chunk of _.chunk(tablesQueryConfigs, 16)) {
    await Promise.all(
      chunk.map(async (tqc) => {
        const agent = await AgentConfiguration.findOne({
          where: {
            tablesQueryConfigurationId: tqc.id,
          },
        });
        if (!agent) {
          logger.warn(
            `No agent found for tables query configuration ${tqc.id}`
          );
          return;
        }
        logger.info(
          `Backfilling tables query configuration ${tqc.id} with \`agentConfigurationId=${agent.id}\` [execute: ${execute}]`
        );
        if (execute) {
          await tqc.update({ agentConfigurationId: agent.id });
        }
      })
    );
  }

  const dustAppRunConfigs = await AgentDustAppRunConfiguration.findAll({
    // @ts-expect-error agentConfigurationId is marked as required in the model, but we are looking for null values
    where: {
      agentConfigurationId: null,
    },
  });

  logger.info(
    `Found ${dustAppRunConfigs.length} dust app run configurations without agent configuration`
  );

  for (const chunk of _.chunk(dustAppRunConfigs, 16)) {
    await Promise.all(
      chunk.map(async (darc) => {
        const agent = await AgentConfiguration.findOne({
          where: {
            dustAppRunConfigurationId: darc.id,
          },
        });
        if (!agent) {
          logger.warn(
            `No agent found for dust app run configuration ${darc.id}`
          );
          return;
        }
        logger.info(
          `Backfilling dust app run configuration ${darc.id} with \`agentConfigurationId=${agent.id}\` [execute: ${execute}]`
        );
        if (execute) {
          await darc.update({ agentConfigurationId: agent.id });
        }
      })
    );
  }
};

makeScript({}, async ({ execute }) => {
  await backfillActionConfigs(execute);
});
