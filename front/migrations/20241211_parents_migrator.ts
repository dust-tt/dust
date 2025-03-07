import type { ConnectorProvider } from "@dust-tt/types";
import {
  concurrentExecutor,
  CoreAPI,
  isConnectorProvider,
  Ok,
  withRetries,
} from "@dust-tt/types";
import assert from "assert";
import _ from "lodash";

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

export function isGithubCodeDirId(internalId: string): boolean {
  return /^github-code-\d+-dir-[a-f0-9]+$/.test(internalId);
}

export function isGithubCodeFileId(internalId: string): boolean {
  return /^github-code-\d+-file-[a-f0-9]+$/.test(internalId);
}
export function isOldGithuRepoId(internalId: string): boolean {
  return /^\d+$/.test(internalId);
}

const migrators: Partial<Record<ConnectorProvider, ProviderMigrator | null>> = {
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
      if (parents.length === 1) {
        logger.warn(
          { nodeId, parents, problem: "Not enough parents" },
          "Invalid slack parents"
        );
      } else if (parents.length === 2) {
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
        throw new Error("Parents len > 2");
      }

      return {
        parents: [nodeId, `slack-channel-${channelId}`],
        parentId: `slack-channel-${channelId}`,
      };
    },
  },
  google_drive: {
    transformer: (nodeId, parents) => {
      const newParents = _.uniq(
        parents.map((id) =>
          id.startsWith("gdrive-") || id.startsWith("google-spreadsheet-")
            ? id
            : `gdrive-${id}`
        )
      );

      return {
        parents: _.uniq([...newParents, ...parents]),
        parentId: newParents[1],
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
  github: {
    transformer: (nodeId, parents) => {
      if (nodeId !== parents[0]) {
        logger.warn(
          { nodeId, parents, problem: "Not enough parents" },
          "Github nodeId !== parents[0]"
        );
        return { parents, parentId: parents[1] };
      }
      const repoId = parents[parents.length - 1];
      // case where we are already good
      if (repoId.startsWith("github-repository")) {
        return { parents, parentId: parents[1] };
      }
      if (parents.length < 3) {
        logger.warn(
          { nodeId, parents, problem: "Not enough parents" },
          "Invalid Github parents"
        );
        return { parents, parentId: parents[1] };
      }
      assert(/^\d+$/.test(repoId), `Invalid repoId: ${repoId}`);

      if (nodeId.startsWith("github-issue-")) {
        return {
          parents: [
            // old parents
            ...parents,
            // new parents
            `github-issues-${repoId}`,
            `github-repository-${repoId}`,
          ],
          parentId: parents[1],
        };
      }
      if (nodeId.startsWith("github-discussion-")) {
        return {
          parents: [
            // old parents
            ...parents,
            // new parents
            `github-discussions-${repoId}`,
            `github-repository-${repoId}`,
          ],
          parentId: parents[1],
        };
      }
      if (nodeId.startsWith("github-code")) {
        // github-code-${repoId}-file-xxx, github-code-${repoId}-dir-xxx, ..., github-code-${repoId}, ${repoId}
        const newParents = [
          nodeId,
          /// putting the code directories here in reverse
          ...parents.filter(isGithubCodeDirId).reverse(),
          repoId.toString(),
          `github-code-${repoId}`,
          `github-repository-${repoId}`,
        ];
        return { parents: newParents, parentId: newParents[1] };
      }
      throw new Error(`Unrecognized node type: ${nodeId}`);
    },
    cleaner: (nodeId, parents) => {
      if (nodeId !== parents[0]) {
        logger.warn(
          { nodeId, parents, problem: "Not enough parents" },
          "Github nodeId !== parents[0]"
        );
        return { parents, parentId: parents[1] };
      }
      const lastParent = parents[parents.length - 1];
      if (!lastParent.startsWith("github-repository-")) {
        logger.warn(
          { nodeId, parents, problem: "Not enough parents" },
          "Github parents[-1] !== github-repository-xxx"
        );
        return { parents, parentId: parents[1] };
      }
      const repoId = lastParent.replace("github-repository-", "");
      assert(/^\d+$/.test(repoId), `Invalid repoId: ${repoId}`);

      if (nodeId.startsWith("github-code-")) {
        assert(isGithubCodeFileId(nodeId), `Github invalid nodeId: ${nodeId}`);

        let dirParents = parents.filter(isGithubCodeDirId);
        const setDirParents = new Set(dirParents);
        /// case where we sent the [nodeId, dir3, dir2, dir1, dir1, dir2, dir3, code, repo] and we want to keep only [nodeId, dir1, dir2, dir3, code, repo]
        if (dirParents.length !== setDirParents.size) {
          dirParents = dirParents.slice(
            dirParents.length / 2,
            dirParents.length
          );
          assert(
            dirParents.every((p) => setDirParents.has(p)),
            "dirParent not in set"
          );
          assert(
            setDirParents.size === dirParents.length,
            "an element from the set is missing"
          );
        }
        return {
          parents: [
            nodeId,
            ...dirParents,
            `github-code-${repoId}`,
            `github-repository-${repoId}`,
          ],
          parentId: dirParents[0],
        };
      }

      assert(
        parents
          .filter((p) => !p.startsWith("github-"))
          .every(
            (p) =>
              p.endsWith("discussions") ||
              p.endsWith("issues") ||
              isOldGithuRepoId(p)
          ),
        "unrecognized parents, nor new nor old"
      );
      // looks brittle but is not, for issues and discussions old parents match ${repoId}-discussions, ${repoId}-issues, ${repoId}
      const newParents = parents.filter((p) => p.startsWith("github-"));
      return { parents: newParents, parentId: newParents[1] };
    },
  },
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
        parentId: uniqueIds.length > 1 ? `notion-${uniqueIds[1]}` : null,
      };
    },
    cleaner: (nodeId, parents) => {
      // Only keep the new parents
      const uniqueIds = _.uniq(
        [nodeId, ...parents].map((x) => _.last(x.split("notion-"))!)
      );
      return {
        parents: uniqueIds.map((id) => `notion-${id}`),
        parentId: uniqueIds.length > 1 ? `notion-${uniqueIds[1]}` : null,
      };
    },
  },
  snowflake: null,
  bigquery: null,
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
  salesforce: null,
};

const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);

async function migrateDocument({
  action,
  migrator,
  dataSource,
  coreDocument,
  execute,
  skipIfParentsAreAlreadyCorrect,
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
  skipIfParentsAreAlreadyCorrect: boolean;
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

  if (
    skipIfParentsAreAlreadyCorrect &&
    newParents.every((x, i) => x === coreDocument.parents[i])
  ) {
    logger.info(
      {
        documentId: coreDocument.document_id,
        fromParents: coreDocument.parents,
        toParents: newParents,
      },
      `SKIP document (parents are already correct)`
    );
    return new Ok(undefined);
  }

  if (execute) {
    await withRetries(
      logger,
      async () => {
        const updateRes = await coreAPI.updateDataSourceDocumentParents({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          documentId: coreDocument.document_id,
          parents: newParents,
          parentId: newParentId,
        });
        if (updateRes.isErr()) {
          logger.error(
            {
              tableId: coreDocument.document_id,
              fromParents: coreDocument.parents,
              toParents: newParents,
              toParentId: newParentId,
            },
            `Error while updating parents`
          );
          throw new Error(updateRes.error.message);
        }
      },
      { retries: 10 }
    )({});

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
  skipIfParentsAreAlreadyCorrect,
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
  skipIfParentsAreAlreadyCorrect: boolean;
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

  if (
    skipIfParentsAreAlreadyCorrect &&
    newParents.every((x, i) => x === coreTable.parents[i])
  ) {
    logger.info(
      {
        tableId: coreTable.table_id,
        fromParents: coreTable.parents,
        toParents: newParents,
      },
      `SKIP table (parents are already correct)`
    );
    return new Ok(undefined);
  }

  if (execute) {
    await withRetries(
      logger,
      async () => {
        const updateRes = await coreAPI.updateTableParents({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          tableId: coreTable.table_id,
          parents: newParents,
          parentId: newParentId,
        });
        if (updateRes.isErr()) {
          logger.error(
            {
              tableId: coreTable.table_id,
              fromParents: coreTable.parents,
              toParents: newParents,
              toParentId: newParentId,
            },
            `Error while updating parents`
          );
          throw new Error(updateRes.error.message);
        }
      },
      { retries: 10 }
    )({});

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
  skipIfParentsAreAlreadyCorrect,
}: {
  action: MigratorAction;
  migrator: ProviderMigrator;
  dataSource: DataSourceModel;
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
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
  let nextId = null;

  for (;;) {
    const [coreDocumentRows] = (await (async () => {
      // If nextId is null, we only filter by timestamp
      if (nextId === null) {
        return corePrimary.query(
          "SELECT id, parents, document_id, timestamp FROM data_sources_documents " +
            "WHERE data_source = ? AND STATUS = ? AND timestamp >= ? " +
            "ORDER BY timestamp ASC, id ASC LIMIT ?",
          {
            replacements: [
              coreDataSourceId,
              "latest",
              nextTimestamp,
              QUERY_BATCH_SIZE,
            ],
          }
        );
      } else {
        // If nextId is not null, we filter by timestamp and id
        return corePrimary.query(
          "SELECT id, parents, document_id, timestamp FROM data_sources_documents " +
            "WHERE data_source = ? AND STATUS = ? AND timestamp >= ? AND id > ? " +
            "ORDER BY timestamp ASC, id ASC LIMIT ?",
          {
            replacements: [
              coreDataSourceId,
              "latest",
              nextTimestamp,
              nextId,
              QUERY_BATCH_SIZE,
            ],
          }
        );
      }
    })()) as {
      id: number;
      parents: string[];
      document_id: string;
      timestamp: number;
    }[][];

    if (coreDocumentRows.length === 0) {
      break;
    }

    // If all documents have the same timestamp, we set nextId to the last id
    nextId =
      coreDocumentRows[0].timestamp ===
      coreDocumentRows[coreDocumentRows.length - 1].timestamp
        ? coreDocumentRows[coreDocumentRows.length - 1].id
        : null;

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
            skipIfParentsAreAlreadyCorrect,
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
            skipIfParentsAreAlreadyCorrect,
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
  skipIfParentsAreAlreadyCorrect,
}: {
  provider: ConnectorProvider;
  action: MigratorAction;
  migrator: ProviderMigrator;
  nextDataSourceId: number;
  execute: boolean;
  skipIfParentsAreAlreadyCorrect: boolean;
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
        skipIfParentsAreAlreadyCorrect,
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
    skipIfParentsAreAlreadyCorrect: {
      type: "boolean",
      required: false,
      default: false,
    },
    nextDataSourceId: {
      type: "number",
      required: false,
      default: 0,
    },
  },
  async ({
    provider,
    action,
    nextDataSourceId,
    execute,
    skipIfParentsAreAlreadyCorrect,
  }) => {
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
      skipIfParentsAreAlreadyCorrect,
    });
  }
);
