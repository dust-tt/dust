import type { ConnectorProvider } from "@dust-tt/types";
import { concurrentExecutor, isConnectorProvider } from "@dust-tt/types";
import _ from "lodash";
import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

type ProviderMigrator = (parents: string[]) => string[];

const AGENT_CONFIGURATION_BATCH_SIZE = 100;
const UPDATE_CONCURRENCY = 10;

enum ConfluenceOldIdPrefix {
  Space = "cspace_",
  Page = "cpage_",
}

enum ConfluenceNewIdPrefix {
  Space = "confluence-space-",
  Page = "confluence-page-",
}

export function getIdFromConfluenceInternalId(internalId: string) {
  const prefixPattern = `^(${ConfluenceOldIdPrefix.Space}|${ConfluenceOldIdPrefix.Page})`;
  return internalId.replace(new RegExp(prefixPattern), "");
}

export function getUpdatedConfluenceId(internalId: string): string {
  // case where we already got new IDs
  if (
    internalId.startsWith(ConfluenceNewIdPrefix.Page) ||
    internalId.startsWith(ConfluenceNewIdPrefix.Space)
  ) {
    return internalId;
  }
  // old page id
  if (internalId.startsWith(ConfluenceOldIdPrefix.Page)) {
    return `${ConfluenceNewIdPrefix.Page}${getIdFromConfluenceInternalId(internalId)}`;
  }
  // old space id
  if (internalId.startsWith(ConfluenceOldIdPrefix.Space)) {
    return `${ConfluenceNewIdPrefix.Space}${getIdFromConfluenceInternalId(internalId)}`;
  }
  throw new Error(`Invalid internal ID: ${internalId}`);
}

/// Migrator: oldParents => newParents idempotently
/// we put null values if no migration is needed
const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: (parents) =>
    parents.map(
      (parent) => `slack-channel-` + _.last(parent.split(`slack-channel-`))!
    ),
  google_drive: null,
  microsoft: null,
  github: null,
  notion: null,
  snowflake: null,
  webcrawler: null,
  zendesk: null, // no migration needed!
  confluence: (parents) => parents.map(getUpdatedConfluenceId),
  intercom: null, // no migration needed!
};

makeScript(
  {
    provider: { type: "string", required: true },
    nextId: { type: "number", default: 0 },
  },
  async ({ execute, provider, nextId }, logger) => {
    if (!isConnectorProvider(provider)) {
      console.error(`Invalid provider ${provider}`);
      return;
    }

    let lastSeenId = nextId;

    for (;;) {
      const configurations = await AgentDataSourceConfiguration.findAll({
        limit: AGENT_CONFIGURATION_BATCH_SIZE,
        where: { id: { [Op.gt]: lastSeenId } },
        order: [["id", "ASC"]],
        nest: true,
        include: [{ model: DataSourceModel, as: "dataSource", required: true }],
      });

      if (configurations.length === 0) {
        break;
      }
      lastSeenId = configurations[configurations.length - 1].id;

      try {
        await concurrentExecutor(
          configurations,
          async (configuration) => {
            if (configuration.dataSource.connectorProvider !== provider) {
              // We focus only on the provider currently migrating.
              return;
            }

            const migrator =
              migrators[configuration.dataSource.connectorProvider];
            if (!migrator) {
              return; // no migration needed
            }

            const { parentsIn, parentsNotIn } = configuration;
            let newParentsIn = parentsIn;
            let newParentsNotIn = parentsNotIn;

            try {
              newParentsIn &&= migrator(newParentsIn);
              newParentsNotIn &&= migrator(newParentsNotIn);
            } catch (e) {
              logger.error({ configuration, e, lastSeenId }, `TRANSFORM_ERROR`);
              throw e;
            }

            if (execute) {
              await configuration.update({
                parentsIn: newParentsIn,
                parentsNotIn: newParentsNotIn,
              });
              logger.info(
                {
                  configurationId: configuration.id,
                  connectorProvider: configuration.dataSource.connectorProvider,
                  fromParentsIn: parentsIn,
                  toParentsIn: newParentsIn,
                  fromParentsNotIn: parentsNotIn,
                  toParentsNotIn: newParentsNotIn,
                },
                `LIVE`
              );
            } else {
              logger.info(
                {
                  configurationId: configuration.id,
                  connectorProvider: configuration.dataSource.connectorProvider,
                  fromParentsIn: parentsIn,
                  toParentsIn: newParentsIn,
                  fromParentsNotIn: parentsNotIn,
                  toParentsNotIn: newParentsNotIn,
                },
                `DRY`
              );
            }
          },
          { concurrency: UPDATE_CONCURRENCY }
        );
        logger.info(`Data processed up to id ${lastSeenId}`);
      } catch (e) {
        logger.error({ error: e, lastSeenId }, `ERROR`);
        throw e;
      }
    }

    logger.info(
      `Finished migrating parents for agent data source configurations.`
    );
  }
);
