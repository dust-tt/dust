import type { ConnectorProvider } from "@dust-tt/types";
import {
  concurrentExecutor,
  CoreAPI,
  isConnectorProvider,
  Ok,
} from "@dust-tt/types";
import assert from "assert";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

type MigratorAction = "transform" | "clean";

const isMigratorAction = (action: string): action is MigratorAction => {
  return ["transform", "clean"].includes(action);
};

type ProviderMigrator = {
  transformer: (nodeId: string, parents: string[]) => string[];
  cleaner: (nodeId: string, parents: string[]) => string[];
};

const QUERY_BATCH_SIZE = 128;
const DOCUMENT_CONCURRENCY = 8;
const TABLE_CONCURRENCY = 16;

enum ConfluenceOldIdPrefix {
  Space = "cspace_",
  Page = "cpage_",
}

enum ConfluenceNewIdPrefix {
  Space = "confluence-space-",
  Page = "confluence-page-",
}

function getIdFromConfluenceInternalId(internalId: string) {
  const prefixPattern = `^(${ConfluenceOldIdPrefix.Space}|${ConfluenceOldIdPrefix.Page})`;
  return internalId.replace(new RegExp(prefixPattern), "");
}

function convertConfluenceOldIdToNewId(internalId: string): string {
  if (internalId.startsWith(ConfluenceOldIdPrefix.Page)) {
    return `${ConfluenceNewIdPrefix.Page}${getIdFromConfluenceInternalId(internalId)}`;
  }
  if (internalId.startsWith(ConfluenceOldIdPrefix.Space)) {
    return `${ConfluenceNewIdPrefix.Space}${getIdFromConfluenceInternalId(internalId)}`;
  }
  throw new Error(`Invalid internal ID: ${internalId}`);
}

function slackNodeIdToChannelId(nodeId: string) {
  const parts = nodeId.split("-");
  if (parts.length < 3) {
    throw new Error("Invalid nodeId 1");
  }
  if (parts[0] !== "slack") {
    throw new Error("Invalid nodeId 2");
  }
  if (!["messages", "thread"].includes(parts[2])) {
    throw new Error("Invalid nodeId 3");
  }
  return parts[1];
}

const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: {
    transformer: (nodeId, parents) => {
      const channelId = slackNodeIdToChannelId(nodeId);
      switch (parents.length) {
        case 1: {
          // Check that parents[0] does not have the prefix (it's the channelId)
          if (parents[0] !== channelId) {
            logger.warn(
              { nodeId, parents, problem: "parents[0] not channelId" },
              "Invalid slack parents"
            );
            break;
          }
          break;
        }
        case 2: {
          // Check parents[0] is the nodeId
          if (parents[0] !== nodeId) {
            logger.warn(
              { nodeId, parents, problem: "parents[0] not nodeid" },
              "Invalid slack parents"
            );
            break;
          }
          // Check that parents[1] is the channelId
          if (parents[1] !== channelId) {
            logger.warn(
              { nodeId, parents, problem: "parents[1] not channelId" },
              "Invalid slack parents"
            );
            break;
          }
          break;
        }
        case 3: {
          // Check parents[0] is the nodeId
          if (parents[0] !== nodeId) {
            logger.warn(
              { nodeId, parents, problem: "parents[0] not nodeid" },
              "Invalid slack parents"
            );
            break;
          }
          // Check that parents[1] is the channelId
          if (parents[1] !== channelId) {
            logger.warn(
              { nodeId, parents, problem: "parents[1] not channelId" },
              "Invalid slack parents"
            );
            break;
          }
          if (parents[2] !== `slack-channel-${channelId}`) {
            logger.warn(
              {
                nodeId,
                parents,
                problem: "parents[2] not prefixed channelId",
              },
              "Invalid slack parents"
            );
            break;
          }
          break;
        }
        default:
          logger.warn(
            { nodeId, parents, problem: "invalid parents len" },
            "Invalid slack parents"
          );
          break;
      }

      return [nodeId, channelId, `slack-channel-${channelId}`];
    },
    cleaner: (nodeId, parents) => {
      const channelId = slackNodeIdToChannelId(nodeId);

      if (parents.length === 2) {
        assert(parents[0] === nodeId, "parents[0] !== nodeId");
        assert(
          parents[1] === `slack-channel-${channelId}`,
          "parents[1] !== slack-channel-channelId"
        );
      } else if (parents.length === 3) {
        assert(parents[0] === nodeId, "parents[0] !== nodeId");
        assert(parents[1] === channelId, "parents[1] !== channelId");
        assert(
          parents[2] === `slack-channel-${channelId}`,
          "parents[2] !== slack-channel-channelId"
        );
      } else {
        throw new Error("Parents len != 2/3");
      }

      return [nodeId, `slack-channel-${channelId}`];
    },
  },
  google_drive: null,
  microsoft: null,
  github: null,
  notion: null,
  snowflake: null,
  webcrawler: null,
  zendesk: null,
  confluence: {
    transformer: (nodeId, parents) => {
      // case where we got old IDs exclusively: we add the new IDs to them
      if (
        parents.every(
          (parent) =>
            parent.startsWith(ConfluenceOldIdPrefix.Page) ||
            parent.startsWith(ConfluenceOldIdPrefix.Space)
        )
      ) {
        return [...parents, ...parents.map(convertConfluenceOldIdToNewId)];
      }
      // checking that we got a mix of old and new IDs, with the old ones matching the new ones
      for (const parent of parents) {
        if (
          parent.startsWith(ConfluenceOldIdPrefix.Page) ||
          parent.startsWith(ConfluenceOldIdPrefix.Space)
        ) {
          assert(parents.includes(convertConfluenceOldIdToNewId(parent)));
        } else {
          assert(
            parent.startsWith(ConfluenceNewIdPrefix.Page) ||
              parent.startsWith(ConfluenceNewIdPrefix.Space)
          );
        }
      }
      return parents;
    },
    cleaner: (nodeId, parents) => {
      // we just remove the old IDs
      return parents.filter(
        (parent) =>
          !(
            parent.startsWith(ConfluenceOldIdPrefix.Page) ||
            parent.startsWith(ConfluenceOldIdPrefix.Space)
          )
      );
    },
  },
  intercom: null,
};

const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

async function migrateDocument({
  action,
  migrator,
  dataSource,
  coreDocument,
  execute,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  coreDocument: {
    id: number;
    parents: string[];
    document_id: string;
  };
  execute: boolean;
}) {
  let newParents = coreDocument.parents;
  try {
    newParents =
      action === "transform"
        ? migrator.transformer(coreDocument.document_id, coreDocument.parents)
        : migrator.cleaner(coreDocument.document_id, coreDocument.parents);
  } catch (e) {
    logger.error(
      {
        documentId: coreDocument.document_id,
        parents: coreDocument.parents,
      },
      `TRANSFORM_ERROR`
    );
    throw e;
  }

  if (execute) {
    const updateRes = await coreAPI.updateDataSourceDocumentParents({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId: coreDocument.document_id,
      parents: newParents,
    });

    if (updateRes.isErr()) {
      throw new Error(updateRes.error.message);
    }

    logger.info(
      {
        documentId: coreDocument.document_id,
        fromParents: coreDocument.parents,
        toParents: newParents,
      },
      `LIVE`
    );
  } else {
    logger.info(
      {
        documentId: coreDocument.document_id,
        fromParents: coreDocument.parents,
        toParents: newParents,
      },
      `DRY`
    );
  }

  return new Ok(undefined);
}

async function migrateTable({
  action,
  migrator,
  dataSource,
  coreTable,
  execute,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  coreTable: {
    id: number;
    parents: string[];
    table_id: string;
  };
  execute: boolean;
}) {
  let newParents = coreTable.parents;
  try {
    newParents =
      action === "transform"
        ? migrator.transformer(coreTable.table_id, coreTable.parents)
        : migrator.cleaner(coreTable.table_id, coreTable.parents);
  } catch (e) {
    logger.error(
      {
        tableId: coreTable.table_id,
        parents: coreTable.parents,
      },
      `TRANSFORM_ERROR`
    );
    throw e;
  }

  if (execute) {
    const updateRes = await coreAPI.updateTableParents({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      tableId: coreTable.table_id,
      parents: newParents,
    });

    if (updateRes.isErr()) {
      throw new Error(updateRes.error.message);
    }

    logger.info(
      {
        tableId: coreTable.table_id,
        fromParents: coreTable.parents,
        toParents: newParents,
      },
      `LIVE`
    );
  } else {
    logger.info(
      {
        tableId: coreTable.table_id,
        fromParents: coreTable.parents,
        toParents: newParents,
      },
      `DRY`
    );
  }

  return new Ok(undefined);
}

async function migrateDataSource({
  action,
  migrator,
  dataSource,
  execute,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  execute: boolean;
}) {
  const corePrimary = getCorePrimaryDbConnection();

  // Retrieve the core data source.
  const [coreDataSourceRows] = (await corePrimary.query(
    `SELECT id, data_source_id FROM data_sources WHERE project = ? AND data_source_id = ?`,
    {
      replacements: [
        dataSource.dustAPIProjectId,
        dataSource.dustAPIDataSourceId,
      ],
    }
  )) as { id: number; data_source_id: string }[][];

  assert(
    coreDataSourceRows.length === 1 &&
      coreDataSourceRows[0].data_source_id === dataSource.dustAPIDataSourceId,
    "Core data source mismatch"
  );
  const coreDataSourceId = coreDataSourceRows[0].id;

  // For all documents in the data source (can be big).
  let nextDocumentId = 0;

  for (;;) {
    const [coreDocumentRows] = (await corePrimary.query(
      "SELECT id, parents, document_id FROM data_sources_documents " +
        "WHERE data_source = ? AND id > ? ORDER BY id ASC LIMIT ?",
      {
        replacements: [coreDataSourceId, nextDocumentId, QUERY_BATCH_SIZE],
      }
    )) as {
      id: number;
      parents: string[];
      document_id: string;
    }[][];

    if (coreDocumentRows.length === 0) {
      break;
    }

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        coreDocumentRows,
        (coreDocument) =>
          migrateDocument({
            action,
            migrator,
            dataSource,
            coreDocument,
            execute,
          }),
        { concurrency: DOCUMENT_CONCURRENCY }
      );
    } catch (e) {
      logger.error(
        {
          error: e,
          nextDataSourceId: dataSource.id,
          nextDocumentId,
        },
        `ERROR`
      );
      throw e;
    }

    nextDocumentId = coreDocumentRows[coreDocumentRows.length - 1].id;
  }

  // For all the tables in the data source (can be big).
  let nextTableId = 0;

  for (;;) {
    const [coreTableRows] = (await corePrimary.query(
      "SELECT id, parents, table_id FROM tables " +
        "WHERE data_source = ? AND id > ? ORDER BY id ASC LIMIT ?",
      {
        replacements: [coreDataSourceId, nextTableId, QUERY_BATCH_SIZE],
      }
    )) as {
      id: number;
      parents: string[];
      table_id: string;
    }[][];

    if (coreTableRows.length === 0) {
      break;
    }

    // concurrentExecutor on documents
    try {
      await concurrentExecutor(
        coreTableRows,
        (coreTable) =>
          migrateTable({
            action,
            migrator,
            dataSource,
            coreTable,
            execute,
          }),
        { concurrency: TABLE_CONCURRENCY }
      );
    } catch (e) {
      logger.error(
        {
          error: e,
          nextDataSourceId: dataSource.id,
          nextTableId,
        },
        `ERROR`
      );
      throw e;
    }

    nextTableId = coreTableRows[coreTableRows.length - 1].id;
  }
}

async function migrateAll({
  provider,
  action,
  migrator,
  nextDataSourceId,
  execute,
}: {
  provider: ConnectorProvider;
  action: MigratorAction;
  migrator: ProviderMigrator;
  nextDataSourceId: number;
  execute: boolean;
}) {
  // retrieve all data sources for the provider
  const dataSources = await DataSourceModel.findAll({
    where: {
      connectorProvider: provider,
    },
    order: [["id", "ASC"]],
  });

  for (const dataSource of dataSources) {
    if (dataSource.id >= nextDataSourceId) {
      logger.info(
        {
          dataSourceId: dataSource.id,
          connectorProvider: dataSource.connectorProvider,
        },
        "MIGRATING"
      );
      await migrateDataSource({
        migrator,
        action,
        dataSource,
        execute,
      });
    } else {
      logger.info({ dataSourceId: dataSource.id }, "SKIP");
    }
  }
}

makeScript(
  {
    provider: {
      type: "string",
      required: true,
    },
    action: {
      type: "string",
      required: true,
    },
    nextDataSourceId: {
      type: "number",
      required: false,
      default: 0,
    },
  },
  async ({ provider, action, nextDataSourceId, execute }) => {
    if (!isMigratorAction(action)) {
      console.error(
        `Invalid action ${action}, supported actions are "transform" and "clean"`
      );
      return;
    }
    if (!isConnectorProvider(provider)) {
      console.error(`Invalid provider ${provider}`);
      return;
    }
    const migrator = migrators[provider];
    if (!migrator) {
      console.error(`No migrator found for provider ${provider}`);
      return;
    }

    await migrateAll({
      provider,
      action,
      migrator,
      nextDataSourceId,
      execute,
    });
  }
);
