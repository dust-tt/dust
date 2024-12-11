import type { ConnectorProvider } from "@dust-tt/types";
import assert from "assert";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

type ProviderMigrator = (parents: string[]) => string[];

const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: null,
  google_drive: null,
  microsoft: null,
  github: null,
  notion: null,
  snowflake: null,
  webcrawler: null,
  zendesk: null,
  confluence: null,
  intercom: null,
};
makeScript({}, async ({ execute }, logger) => {
  // pagination + concurrency
  const agentDataSourceConfigurations =
    await AgentDataSourceConfiguration.findAll({
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

  for (const agentDataSourceConfiguration of agentDataSourceConfigurations) {
    assert(
      agentDataSourceConfiguration.dataSource.connectorProvider,
      "connectorProvider is required"
    );
    const migrator =
      migrators[agentDataSourceConfiguration.dataSource.connectorProvider];
    assert(migrator, "No migrator found for the connector provider");

    const { parentsIn, parentsNotIn } = agentDataSourceConfiguration;

    if (execute) {
      await agentDataSourceConfiguration.update({
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
  }

  logger.info(
    `Finished migrating parents for agent data source configurations.`
  );
});
