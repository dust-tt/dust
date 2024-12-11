import type { ConnectorProvider } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";
import assert from "assert";
import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

type ProviderMigrator = (parents: string[]) => string[];

const AGENT_CONFIGURATION_BATCH_SIZE = 100;
const UPDATE_CONCURRENCY = 10;

// we put null values if no migration is needed
const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: null,
  google_drive: null,
  microsoft: null,
  github: null,
  notion: null,
  snowflake: null,
  webcrawler: null,
  zendesk: null, // no migration needed!
  confluence: (parents) =>
    parents.map((parent) =>
      parent
        .replace("cspace_", "confluence-space")
        .replace("cpace_", "confluence-page")
    ),
  intercom: null,
};

makeScript({}, async ({ execute }, logger) => {
  let lastSeenId = 0;

  for (;;) {
    const configurations = await AgentDataSourceConfiguration.findAll({
      limit: AGENT_CONFIGURATION_BATCH_SIZE,
      where: { id: { [Op.gt]: lastSeenId } },
      order: [["id", "ASC"]],
      raw: true,
      include: [
        {
          model: DataSourceModel,
          as: "dataSource",
          attributes: [],
          required: true,
        },
      ],
    });

    if (configurations.length === 0) {
      break;
    }
    lastSeenId = configurations[configurations.length - 1].id;

    await concurrentExecutor(
      configurations,
      async (configuration) => {
        assert(
          configuration.dataSource.connectorProvider,
          "connectorProvider is required"
        );
        const migrator = migrators[configuration.dataSource.connectorProvider];
        if (!migrator) {
          return; // no migration needed
        }

        const { parentsIn, parentsNotIn } = configuration;

        if (execute) {
          await configuration.update({
            parentsIn: parentsIn && migrator(parentsIn),
            parentsNotIn: parentsNotIn && migrator(parentsNotIn),
          });
        } else {
          logger.info(
            {
              parentsIn,
              newParentsIn: parentsIn && migrator(parentsIn),
              parentsNotIn,
              newParentsNotIn: parentsNotIn && migrator(parentsNotIn),
            },
            "Would update agent data source configuration"
          );
        }
      },
      { concurrency: UPDATE_CONCURRENCY }
    );
    logger.info(`Data processed up to id ${lastSeenId}`);
  }

  logger.info(
    `Finished migrating parents for agent data source configurations.`
  );
});
