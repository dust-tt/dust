import type { ConnectorProvider } from "@dust-tt/types";
import { concurrentExecutor, isConnectorProvider } from "@dust-tt/types";
import _ from "lodash";
import type { Logger } from "pino";
import { Op } from "sequelize";

import { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { DataSourceViewModel } from "@app/lib/resources/storage/models/data_source_view";
import { makeScript } from "@app/scripts/helpers";

type ProviderMigrator = (parents: string[]) => string[];

const BATCH_SIZE = 100;
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
const migrators: Record<Partial<ConnectorProvider>, ProviderMigrator | null> = {
  slack: (parents) =>
    parents.map(
      (parent) => `slack-channel-` + _.last(parent.split(`slack-channel-`))!
    ),
  google_drive: (parents) =>
    parents.map((parent) =>
      parent.startsWith("gdrive-") || parent.startsWith("google-spreadsheet-")
        ? parent
        : `gdrive-${parent}`
    ),
  microsoft: null,
  github: (parents) => {
    return [
      ...new Set(
        parents.map((parent) => {
          if (/^\d+$/.test(parent)) {
            return `github-repository-${parent}`;
          }
          if (/\d+-issues$/.test(parent)) {
            const repoId = parseInt(parent.replace(/-issues$/, ""), 10);
            return `github-issues-${repoId}`;
          }
          if (/\d+-discussions$/.test(parent)) {
            const repoId = parseInt(parent.replace(/-discussions$/, ""), 10);
            return `github-discussions-${repoId}`;
          }
          if (
            /^github-code-\d+$/.test(parent) ||
            /^github-code-\d+-dir-[a-f0-9]+$/.test(parent) ||
            /^github-code-\d+-file-[a-f0-9]+$/.test(parent) ||
            /^github-discussions-\d+$/.test(parent) ||
            /^github-discussion-\d+$/.test(parent) ||
            /^github-issues-\d+$/.test(parent) ||
            /^github-issue-\d+$/.test(parent) ||
            /^github-repository-\d+$/.test(parent)
          ) {
            return parent;
          }
          throw new Error(`Unrecognized parent type: ${parent}`);
        })
      ),
    ];
  },
  notion: (parents) => {
    return _.uniq(parents.map((p) => _.last(p.split("notion-"))!)).map(
      (id) => `notion-${id}`
    );
  },
  snowflake: null,
  bigquery: null,
  webcrawler: null,
  zendesk: null, // no migration needed!
  confluence: (parents) => parents.map(getUpdatedConfluenceId),
  intercom: null, // no migration needed!
  salesforce: null, // didn't exist at the time !
};

async function migrateAgentDataSourceConfigurations({
  provider,
  execute,
  logger,
}: {
  provider: ConnectorProvider;
  execute: boolean;
  logger: Logger;
}) {
  let lastSeenId = 0;
  for (;;) {
    const configurations = await AgentDataSourceConfiguration.findAll({
      limit: BATCH_SIZE,
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
                provider,
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
                provider,
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
  logger.info(`FINISHED AgentDataSourceConfiguration`);
}

async function migrateDataSourceViews({
  provider,
  execute,
  logger,
}: {
  provider: ConnectorProvider;
  execute: boolean;
  logger: Logger;
}) {
  let lastSeenId = 0;
  for (;;) {
    const dataSourceViews = await DataSourceViewModel.findAll({
      limit: BATCH_SIZE,
      where: { id: { [Op.gt]: lastSeenId } },
      order: [["id", "ASC"]],
      nest: true,
      include: [
        { model: DataSourceModel, as: "dataSourceForView", required: true },
      ],
    });

    if (dataSourceViews.length === 0) {
      break;
    }
    lastSeenId = dataSourceViews[dataSourceViews.length - 1].id;

    try {
      await concurrentExecutor(
        dataSourceViews,
        async (dsView) => {
          if (dsView.dataSourceForView.connectorProvider !== provider) {
            // We focus only on the provider currently migrating.
            return;
          }

          const migrator =
            migrators[dsView.dataSourceForView.connectorProvider];
          if (!migrator) {
            return; // no migration needed
          }

          const { parentsIn } = dsView;
          let newParentsIn = parentsIn;

          try {
            newParentsIn &&= migrator(newParentsIn);
          } catch (e) {
            logger.error(
              { configuration: dsView, e, lastSeenId },
              `TRANSFORM_ERROR`
            );
            throw e;
          }

          if (execute) {
            await dsView.update({
              parentsIn: newParentsIn,
            });
            logger.info(
              {
                dsViewId: dsView.id,
                provider,
                fromParentsIn: parentsIn,
                toParentsIn: newParentsIn,
              },
              `LIVE`
            );
          } else {
            logger.info(
              {
                dsViewId: dsView.id,
                provider,
                fromParentsIn: parentsIn,
                toParentsIn: newParentsIn,
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
  logger.info(`FINISHED DataSourceViewModel`);
}

makeScript(
  {
    provider: { type: "string", required: true },
  },
  async ({ execute, provider }, logger) => {
    if (!isConnectorProvider(provider)) {
      console.error(`Invalid provider ${provider}`);
      return;
    }

    await migrateAgentDataSourceConfigurations({
      provider,
      execute,
      logger,
    });

    await migrateDataSourceViews({
      provider,
      execute,
      logger,
    });
  }
);
