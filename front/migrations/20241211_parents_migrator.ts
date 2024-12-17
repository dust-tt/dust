import type { ConnectorProvider } from "@dust-tt/types";
import {
  concurrentExecutor,
  CoreAPI,
  isConnectorProvider,
  Ok,
} from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";

import apiConfig from "@app/lib/api/config";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { withRetries } from "@app/lib/utils/retries";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

type MigratorAction = "transform" | "clean";

const isMigratorAction = (action: string): action is MigratorAction => {
  return ["transform", "clean"].includes(action);
};

type ProviderMigrator = {
  /// returns [nodeId, ...oldParents, ...newParents] idempotently
  transformer: (
    nodeId: string,
    parents: string[]
  ) => { parents: string[]; parentId: string | null };
  /// returns [nodeId, ...newParents] idempotently
  cleaner: (
    nodeId: string,
    parents: string[]
  ) => { parents: string[]; parentId: string | null };
};

const QUERY_BATCH_SIZE = 256;
const DOCUMENT_CONCURRENCY = 16;
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
  const oldPrefixPattern = `^(${ConfluenceOldIdPrefix.Space}|${ConfluenceOldIdPrefix.Page})`;
  const newPrefixPattern = `^(${ConfluenceNewIdPrefix.Space}|${ConfluenceNewIdPrefix.Page})`;
  return internalId
    .replace(new RegExp(oldPrefixPattern), "")
    .replace(new RegExp(newPrefixPattern), ""); // we can have chained old-new prefixes on the initial upsert (huge regression introduced a month ago)
}

function convertConfluenceOldIdToNewId(internalId: string): string {
  if (internalId.startsWith(ConfluenceOldIdPrefix.Page)) {
    return `${ConfluenceNewIdPrefix.Page}${getIdFromConfluenceInternalId(internalId)}`;
  }
  if (internalId.startsWith(ConfluenceOldIdPrefix.Space)) {
    return `${ConfluenceNewIdPrefix.Space}${getIdFromConfluenceInternalId(internalId)}`;
  }
  return internalId;
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

      return {
        parents: [nodeId, channelId, `slack-channel-${channelId}`],
        parentId: channelId,
      };
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

      return {
        parents: [nodeId, `slack-channel-${channelId}`],
        parentId: `slack-channel-${channelId}`,
      };
    },
  },
  google_drive: {
    transformer: (nodeId, parents) => {
      const newParents = parents.map((id) =>
        id.startsWith("gdrive-") || id.startsWith("google-spreadsheet-")
          ? id
          : `gdrive-${id}`
      );

      return {
        parents: _.uniq([...newParents, ...parents]),
        parentId: `gdrive-${parents[1]}`,
      };
    },
    cleaner: (nodeId, parents) => {
      return {
        parents: parents.filter(
          (id) =>
            id.startsWith("gdrive-") || id.startsWith("google-spreadsheet-")
        ),
        parentId: parents[1],
      };
    },
  },
  microsoft: null,
  github: null,
  notion: {
    transformer: (nodeId, parents) => {
      const uniqueIds = _.uniq(
        [nodeId, ...parents].map((x) => _.last(x.split("notion-"))!)
      );
      return {
        parents: [
          // new parents
          ...uniqueIds.map((id) => `notion-${id}`),
          // legacy parents
          ...uniqueIds,
        ],
        parentId: `notion-${uniqueIds[0]}`,
      };
    },
    cleaner: (nodeId, parents) => {
      // Only keep the new parents
      const uniqueIds = _.uniq(
        [nodeId, ...parents].map((x) => _.last(x.split("notion-"))!)
      );
      return {
        parents: uniqueIds.map((id) => `notion-${id}`),
        parentId: `notion-${uniqueIds[0]}`,
      };
    },
  },
  snowflake: null,
  webcrawler: null,
  zendesk: null,
  confluence: {
    transformer: (nodeId, parents) => {
      if (parents.length <= 1) {
        // we skip these for now
        logger.warn(
          { nodeId, parents, problem: "Not enough parents" },
          "Invalid Confluence parents"
        );
        return { parents: [nodeId], parentId: null };
      }
      return {
        parents: [
          ...new Set([
            ...parents,
            ...parents.map(convertConfluenceOldIdToNewId),
          ]),
        ],
        parentId: parents[1],
      };
    },
    cleaner: (_, parents) => {
      // we just remove the old IDs
      const newParents = parents.filter(
        (parent) =>
          !(
            parent.startsWith(ConfluenceOldIdPrefix.Page) ||
            parent.startsWith(ConfluenceOldIdPrefix.Space)
          )
      );
      assert(parents.length > 1, "parents.length <= 1"); // the only documents are pages, they at least have the space as parent
      return { parents: newParents, parentId: newParents[1] };
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
  let newParentId: string | null = null;
  try {
    const { parents, parentId } =
      action === "transform"
        ? migrator.transformer(coreDocument.document_id, coreDocument.parents)
        : migrator.cleaner(coreDocument.document_id, coreDocument.parents);
    newParents = parents;
    newParentId = parentId;
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
    const updateRes = await withRetries(
      async () => {
        return coreAPI.updateDataSourceDocumentParents({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          documentId: coreDocument.document_id,
          parents: newParents,
          parentId: newParentId,
        });
      },
      { retries: 3 }
    )({});

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
  let newParentId: string | null = null;
  try {
    const { parents, parentId } =
      action === "transform"
        ? migrator.transformer(coreTable.table_id, coreTable.parents)
        : migrator.cleaner(coreTable.table_id, coreTable.parents);
    newParents = parents;
    newParentId = parentId;
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
    const updateRes = await withRetries(
      async () => {
        return coreAPI.updateTableParents({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          tableId: coreTable.table_id,
          parents: newParents,
          parentId: newParentId,
        });
      },
      { retries: 3 }
    )({});

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
  let nextTimestamp = 0;

  for (;;) {
    const [coreDocumentRows] = (await corePrimary.query(
      "SELECT id, parents, document_id, timestamp FROM data_sources_documents " +
        "WHERE data_source = ? AND STATUS = ? AND timestamp > ? " +
        "ORDER BY timestamp ASC LIMIT ?",
      {
        replacements: [
          coreDataSourceId,
          "latest",
          nextTimestamp,
          QUERY_BATCH_SIZE,
        ],
      }
    )) as {
      id: number;
      parents: string[];
      document_id: string;
      timestamp: number;
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
          nextTimestamp,
        },
        `ERROR`
      );
      throw e;
    }

    nextTimestamp = coreDocumentRows[coreDocumentRows.length - 1].timestamp;
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
