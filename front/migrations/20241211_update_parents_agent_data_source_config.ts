import type { ConnectorProvider } from "@dust-tt/types";
import { concurrentExecutor } from "@dust-tt/types";
import assert from "assert";
import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";

type MigratorAction = "transform" | "clean";

const isMigratorAction = (action: string): action is MigratorAction => {
  return ["transform", "clean"].includes(action);
};

type ProviderMigrator = {
  transformer: (parents: string[]) => string[];
  cleaner: (parents: string[]) => string[];
};

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
  confluence: {
    transformer: (parents) => [
      ...new Set([...parents, ...parents.map(getUpdatedConfluenceId)]),
    ],
    cleaner: (parents) =>
      parents.filter(
        (parent) =>
          !parent.startsWith(ConfluenceOldIdPrefix.Page) &&
          !parent.startsWith(ConfluenceOldIdPrefix.Space)
      ),
  },
  intercom: null, // no migration needed!
};

makeScript(
  {
    action: { type: "string" },
    nextId: { type: "number", default: 0 },
  },
  async ({ execute, action, nextId }, logger) => {
    if (!isMigratorAction(action)) {
      console.error(
        `Invalid action ${action}, supported actions are "transform" and "clean"`
      );
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
            assert(
              configuration.dataSource.connectorProvider,
              "connectorProvider is required"
            );
            const migrator =
              migrators[configuration.dataSource.connectorProvider];
            if (!migrator) {
              return; // no migration needed
            }

            const { parentsIn, parentsNotIn } = configuration;
            const newParentsIn =
              parentsIn &&
              (action === "transform"
                ? migrator.transformer
                : migrator.cleaner)(parentsIn);
            const newParentsNotIn =
              parentsNotIn &&
              (action === "clean" ? migrator.transformer : migrator.cleaner)(
                parentsNotIn
              );

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
