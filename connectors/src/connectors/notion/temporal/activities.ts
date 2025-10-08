import { assertNever } from "@dust-tt/client";
import { Storage } from "@google-cloud/storage";
import {
  APIResponseError,
  isFullBlock,
  isFullPage,
  isNotionClientError,
} from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { Context } from "@temporalio/activity";
import { chunk } from "lodash";
import type { Logger } from "pino";
import { Op } from "sequelize";

import { nodeIdFromNotionId } from "@connectors/connectors/notion";
import { getNotionAccessToken } from "@connectors/connectors/notion/lib/access_token";
import {
  getNotionDatabaseFromConnectorsDb,
  getNotionPageFromConnectorsDb,
  upsertNotionDatabaseInConnectorsDb,
  upsertNotionPageInConnectorsDb,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import {
  getBlockParentMemoized,
  getPageOrBlockParent,
  getPagesAndDatabasesEditedSince,
  getParsedDatabase,
  getUserName,
  isAccessibleAndUnarchived,
  parsePageBlock,
  parsePageProperties,
  renderDatabaseFromPages,
  retrieveBlockChildrenResultPage,
  retrieveDatabaseChildrenResultPage,
  retrievePage,
} from "@connectors/connectors/notion/lib/notion_api";
import {
  getParents,
  updateAllParentsFields,
} from "@connectors/connectors/notion/lib/parents";
import { getTagsForPage } from "@connectors/connectors/notion/lib/tags";
import {
  DATABASE_PROCESSING_INTERVAL_MS,
  DATABASE_TO_CSV_MAX_SIZE,
} from "@connectors/connectors/notion/temporal/config";
import { connectorsConfig } from "@connectors/connectors/shared/config";
import {
  dataSourceConfigFromConnector,
  dataSourceInfoFromConnector,
} from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  deleteDataSourceTable,
  deleteDataSourceTableRow,
  ignoreTablesError,
  MAX_DOCUMENT_TXT_LEN,
  MAX_PREFIX_CHARS,
  MAX_PREFIX_TOKENS,
  renderDocumentTitleAndContent,
  renderPrefixSection,
  sectionLength,
  truncateSection,
  updateDataSourceDocumentParents,
  updateDataSourceTableParents,
  upsertDataSourceDocument,
  upsertDataSourceTableFromCsv,
} from "@connectors/lib/data_sources";
import {
  NotionConnectorBlockCacheEntry,
  NotionConnectorPageCacheEntry,
  NotionConnectorResourcesToCheckCacheEntry,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { heartbeat } from "@connectors/lib/temporal";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  DataSourceConfig,
  ModelId,
  PageObjectProperties,
  ParsedNotionBlock,
} from "@connectors/types";
import {
  getNotionDatabaseTableId,
  INTERNAL_MIME_TYPES,
  isDevelopment,
  slugify,
} from "@connectors/types";
import { redisClient } from "@connectors/types/shared/redis_client";
import { sha256 } from "@connectors/types/shared/utils/hashing";

const logger = mainLogger.child({ provider: "notion" });

// Connector ID hashes for which deletion should be skipped during garbage collection.
const SKIP_DELETION_CONNECTOR_ID_HASHES = new Set<string>([
  "pDddXWMzWYw4oN/acYfLiOwxB3tlp51IH6MuMYD3YXQ=",
]);

const wrapWithErrorCheck = async <T>(
  callback: () => Promise<T>,
  loggerArgs: Record<string, string | number>
) => {
  try {
    return await callback();
  } catch (e) {
    if (APIResponseError.isAPIResponseError(e)) {
      if (
        (e.code === "internal_server_error" && e.status === 500) ||
        (e.code === "service_unavailable" && e.status === 503)
      ) {
        if (Context.current().info.attempt > 20) {
          logger.error(
            {
              ...loggerArgs,
              error: e,
              attempt: Context.current().info.attempt,
            },
            "Failed to get make notion call. Giving up and moving on"
          );
          return null;
        }
      }
    }

    throw e;
  }
};

export async function fetchDatabaseChildPages({
  connectorId,
  databaseId,
  cursor,
  loggerArgs,
  returnUpToDatePageIdsForExistingDatabase,
  storeInCache,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  databaseId: string;
  cursor: string | null;
  loggerArgs: Record<string, string | number>;
  storeInCache: boolean;
  topLevelWorkflowId: string;
  returnUpToDatePageIdsForExistingDatabase: boolean;
}): Promise<{
  pageIds: string[];
  nextCursor: string | null;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const notionDbModel = await NotionDatabase.findOne({
    where: {
      connectorId: connector.id,
      notionDatabaseId: databaseId,
    },
  });

  if (notionDbModel?.skipReason) {
    logger.info(
      { skipReason: notionDbModel.skipReason },
      "Skipping database with skip reason"
    );
    return {
      pageIds: [],
      nextCursor: null,
    };
  }

  const accessToken = await getNotionAccessToken(connector.id);

  const localLoggerArgs = {
    ...loggerArgs,
    databaseId,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  };
  const localLogger = logger.child(localLoggerArgs);

  const res = await wrapWithErrorCheck(
    () =>
      retrieveDatabaseChildrenResultPage({
        accessToken,
        databaseId,
        loggerArgs: localLoggerArgs,
        cursor,
      }),
    {
      ...loggerArgs,
      databaseId,
    }
  );

  if (!res) {
    return {
      pageIds: [],
      nextCursor: null,
    };
  }

  const { results, next_cursor: nextCursor } = res;

  const pages: PageObjectResponse[] = [];
  for (const r of results) {
    if (isFullPage(r)) {
      pages.push(r);
    }
  }

  if (storeInCache) {
    await cacheDatabaseChildPages({
      connectorId,
      topLevelWorkflowId,
      loggerArgs: localLoggerArgs,
      pages,
      databaseId,
    });
  }

  const isExistingDatabase = notionDbModel && notionDbModel.lastUpsertedRunTs;

  if (
    // If `returnUpToDatePageIdsForExistingDatabase` is true, we always return all the pages.
    returnUpToDatePageIdsForExistingDatabase ||
    // If the database is new (either we never seen it before, or the first time we saw it was
    // during this run), we return all the pages.
    !isExistingDatabase
  ) {
    return {
      pageIds: pages.map((p) => p.id),
      nextCursor,
    };
  }
  // Otherwise, we filter-out pages that are already up to date.

  // We exclude pages that we have already seen since their lastEditedTs we recieved from
  // getPagesEditedSince.
  const existingPages = await NotionPage.findAll({
    where: {
      notionPageId: pages.map((p) => p.id),
      connectorId: connector.id,
    },
    attributes: ["notionPageId", "lastSeenTs"],
  });
  if (existingPages.length > 0) {
    localLogger.info({ count: existingPages.length }, "Found existing pages");
  }

  const lastSeenTsByPageId = new Map<string, number>();
  for (const page of existingPages) {
    lastSeenTsByPageId.set(page.notionPageId, page.lastSeenTs.getTime());
  }
  const filteredPageIds = pages
    .filter(({ id, last_edited_time }) => {
      const ts = lastSeenTsByPageId.get(id);
      return !ts || ts < new Date(last_edited_time).getTime();
    })
    .map((p) => p.id);

  if (filteredPageIds.length < pages.length) {
    localLogger.info(
      {
        initial_count: pages.length,
        filtered_count: pages.length - filteredPageIds.length,
      },
      "Filtered out database child pages already up to date."
    );
  }

  return {
    pageIds: filteredPageIds,
    nextCursor,
  };
}

export async function getPagesAndDatabasesToSync({
  connectorId,
  lastSyncedAt,
  cursors,
  excludeUpToDatePages,
  loggerArgs,
  filter,
}: {
  connectorId: ModelId;
  lastSyncedAt: number | null;
  cursors: {
    previous: string | null;
    last: string | null;
  };
  excludeUpToDatePages: boolean;
  loggerArgs: Record<string, string | number>;
  filter?: "page" | "database";
}): Promise<{
  pageIds: string[];
  databaseIds: string[];
  nextCursor: string | null;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    ...loggerArgs,
    connectorId: connector.id,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  const accessToken = await getNotionAccessToken(connector.id);

  const skippedDatabases = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
      skipReason: {
        [Op.not]: null,
      },
    },
  });
  const skippedDatabaseIds = new Set(
    skippedDatabases.map((db) => db.notionDatabaseId)
  );

  let res;
  try {
    res = await getPagesAndDatabasesEditedSince({
      notionAccessToken: accessToken,
      sinceTs: lastSyncedAt,
      cursors,
      loggerArgs: {
        ...loggerArgs,
        dataSourceId: connector.dataSourceId,
        workspaceId: connector.workspaceId,
      },
      skippedDatabaseIds,
      filter,
    });
  } catch (e) {
    if (isNotionClientError(e)) {
      // Sometimes a cursor will consistently fail with 500.
      // In this case, there is not much we can do, so we just give up and move on.
      // Notion workspaces are resynced daily so nothing is lost forever.
      switch (e.code) {
        case "internal_server_error":
        case "validation_error":
          if (Context.current().info.attempt > 14) {
            localLogger.error(
              {
                error: e,
                attempt: Context.current().info.attempt,
              },
              "Failed to get Notion search result page with cursor. Giving up and moving on"
            );
            return {
              pageIds: [],
              databaseIds: [],
              nextCursor: null,
            };
          }
          throw e;

        default:
          throw e;
      }
    }

    throw e;
  }

  const { pages, dbs, nextCursor } = res;

  if (!excludeUpToDatePages) {
    return {
      pageIds: pages.map((p) => p.id),
      databaseIds: dbs.map((db) => db.id),
      nextCursor,
    };
  }

  // We exclude pages that we have already seen since their lastEditedTs we recieved from
  // getPagesEditedSince.
  const existingPages = await NotionPage.findAll({
    where: {
      notionPageId: pages.map((p) => p.id),
      connectorId: connector.id,
    },
    attributes: ["notionPageId", "lastSeenTs"],
  });

  if (existingPages.length > 0) {
    localLogger.info({ count: existingPages.length }, "Found existing pages");
  }

  const lastSeenTsByPageId = new Map<string, number>();
  for (const page of existingPages) {
    lastSeenTsByPageId.set(page.notionPageId, page.lastSeenTs.getTime());
  }
  const filteredPageIds = pages
    .filter(({ id, lastEditedTs }) => {
      const ts = lastSeenTsByPageId.get(id);
      return !ts || ts < lastEditedTs;
    })
    .map((p) => p.id);

  localLogger.info(
    {
      initial_count: existingPages.length,
      filtered_count: existingPages.length - filteredPageIds.length,
    },
    "Filtered out pages already up to date."
  );

  // We do the same for databases.
  const existingDatabases = await NotionDatabase.findAll({
    where: {
      notionDatabaseId: dbs.map((d) => d.id),
      connectorId: connector.id,
    },
    attributes: ["notionDatabaseId", "lastSeenTs"],
  });
  localLogger.info(
    { count: existingDatabases.length },
    "Found existing databases"
  );
  const lastSeenTsByDatabaseId = new Map<string, number>();
  for (const db of existingDatabases) {
    lastSeenTsByDatabaseId.set(db.notionDatabaseId, db.lastSeenTs.getTime());
  }
  const filteredDatabaseIds = dbs
    .filter(({ id, lastEditedTs }) => {
      const ts = lastSeenTsByDatabaseId.get(id);
      return !ts || ts < lastEditedTs;
    })
    .map((p) => p.id);

  localLogger.info(
    {
      initial_count: existingDatabases.length,
      filtered_count: existingDatabases.length - filteredDatabaseIds.length,
    },
    "Filtered out databases already up to date."
  );

  return {
    pageIds: filteredPageIds,
    databaseIds: filteredDatabaseIds,
    nextCursor,
  };
}

export async function upsertDatabaseInConnectorsDb({
  connectorId,
  databaseId,
  runTimestamp,
  topLevelWorkflowId,
  requestQueuingForUpsertToCore,
  loggerArgs,
}: {
  connectorId: ModelId;
  databaseId: string;
  runTimestamp: number;
  topLevelWorkflowId: string;
  requestQueuingForUpsertToCore: boolean;
  loggerArgs: Record<string, string | number>;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const accessToken = await getNotionAccessToken(connector.id);

  const localLogger = logger.child({ ...loggerArgs, databaseId });

  const notionDatabase = await getNotionDatabaseFromConnectorsDb(
    connectorId,
    databaseId
  );

  const alreadySeenInRun =
    notionDatabase?.lastSeenTs?.getTime() === runTimestamp;

  if (alreadySeenInRun) {
    localLogger.info("Skipping database already seen in this run");
    return;
  }

  const isSkipped = !!notionDatabase?.skipReason;

  if (isSkipped) {
    localLogger.info(
      { skipReason: notionDatabase.skipReason },
      "Skipping database with skip reason"
    );
    return;
  }

  localLogger.info(
    "notionUpsertDatabaseActivity: Upserting notion database in DB."
  );

  const parsedDb = await wrapWithErrorCheck(
    () => getParsedDatabase(accessToken, databaseId, loggerArgs),
    {
      ...loggerArgs,
      databaseId,
    }
  );

  let parentType: NotionConnectorPageCacheEntry["parentType"] | undefined =
    parsedDb?.parentType;
  let parentId = parsedDb?.parentId;

  if (parsedDb) {
    // Checks if the parent is accessible. If that fails, returns "unknown" parent (i.e, orphaned
    // node).
    const resolvedParent = await resolveResourceParent({
      parentId: parsedDb.parentId,
      parentType: parsedDb.parentType,
      pageOrDbId: databaseId,
      accessToken,
      loggerArgs: {
        ...loggerArgs,
        workspaceId: connector.workspaceId,
        dataSourceId: connector.dataSourceId,
      },
    });

    parentType = resolvedParent.parentType;
    parentId = resolvedParent.parentId;

    await maybeAddParentToResourcesToCheck({
      connectorId,
      parentId,
      parentType,
      pageOrDbId: databaseId,
      topLevelWorkflowId,
      loggerArgs,
    });
  }

  const createdOrMoved =
    parentType !== notionDatabase?.parentType ||
    parentId !== notionDatabase?.parentId;

  await upsertNotionDatabaseInConnectorsDb({
    connectorId,
    notionDatabaseId: databaseId,
    runTimestamp,
    parentType: parentType ?? null,
    parentId: parentId ?? null,
    title: parsedDb ? parsedDb.title : null,
    notionUrl: parsedDb ? parsedDb.url : null,
    lastCreatedOrMovedRunTs: createdOrMoved ? runTimestamp : undefined,
    requestQueuingForUpsertToCore,
  });
}

export async function saveSuccessSync(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function saveStartSync(connectorId: ModelId) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function isFullSyncPendingOrOngoing({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<boolean> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!notionConnectorState) {
    throw new Error("Could not find notionConnectorState");
  }

  // If we have never finished a full sync, we should not garbage collect
  const firstSuccessfulSyncTime = connector.firstSuccessfulSyncTime;
  if (!firstSuccessfulSyncTime) {
    return true;
  }

  // If we are currently doing a full resync, we should not garbage collect
  const isDoingAFullResync =
    notionConnectorState.fullResyncStartTime &&
    connector.lastSyncFinishTime &&
    notionConnectorState.fullResyncStartTime > connector.lastSyncFinishTime;
  if (isDoingAFullResync) {
    return true;
  }

  return false;
}

// marks all the pageIds and databaseIds as seen in the database (so we know we don't need
// to delete them) and returns the new pageIds and databaseIds that we haven't seen before
export async function garbageCollectorMarkAsSeenAndReturnNewEntities({
  connectorId,
  pageIds,
  databaseIds,
}: {
  connectorId: ModelId;
  pageIds: string[];
  databaseIds: string[];
  runTimestamp: number;
}): Promise<{ newPageIds: string[]; newDatabaseIds: string[] }> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  const redisCli = await redisClient({ origin: "notion_gc" });
  const redisKey = redisGarbageCollectorKey(connector.id);
  if (pageIds.length > 0) {
    await redisCli.sAdd(`${redisKey}-pages`, pageIds);
  }
  if (databaseIds.length > 0) {
    await redisCli.sAdd(`${redisKey}-databases`, databaseIds);
  }

  const existingPageIds = new Set(
    (
      await NotionPage.findAll({
        where: {
          notionPageId: pageIds,
          connectorId: connector.id,
          skipReason: {
            [Op.is]: null,
          },
        },
        attributes: ["notionPageId"],
      })
    ).map((page) => page.notionPageId)
  );

  const newPageIds = pageIds.filter((pageId) => !existingPageIds.has(pageId));
  if (newPageIds.length) {
    localLogger.info(
      { newPagesCount: newPageIds.length },
      "Found new pages to sync."
    );
  }

  const existingDatabaseIds = new Set(
    (
      await NotionDatabase.findAll({
        where: {
          notionDatabaseId: databaseIds,
          connectorId: connector.id,
          skipReason: {
            [Op.is]: null,
          },
        },
        attributes: ["notionDatabaseId"],
      })
    ).map((database) => database.notionDatabaseId)
  );

  const newDatabaseIds = databaseIds.filter(
    (databaseId) => !existingDatabaseIds.has(databaseId)
  );
  if (newDatabaseIds.length) {
    localLogger.info(
      { newDatabasesCount: newDatabaseIds.length },
      "Found new databases to sync."
    );
  }

  return { newPageIds, newDatabaseIds };
}

export async function deletePage({
  connectorId,
  dataSourceConfig,
  pageId,
  logger,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  pageId: string;
  logger: Logger;
}) {
  const connectorIdHash = sha256(connectorId.toString());

  if (SKIP_DELETION_CONNECTOR_ID_HASHES.has(connectorIdHash)) {
    logger.info(
      {
        action: "skip_deletion",
        resource_type: "page",
        pageId,
        connectorId,
        connectorIdHash,
      },
      "Skipping page deletion for connector with deletion disabled"
    );
    return;
  }

  logger.info("Deleting page.");
  await deleteDataSourceDocument(dataSourceConfig, `notion-${pageId}`);
  const notionPage = await NotionPage.findOne({
    where: {
      connectorId,
      notionPageId: pageId,
    },
  });
  if (notionPage?.parentType === "database" && notionPage.parentId) {
    const parentDatabase = await NotionDatabase.findOne({
      where: {
        connectorId,
        notionDatabaseId: notionPage.parentId,
      },
    });
    if (parentDatabase) {
      const tableId = `notion-${parentDatabase.notionDatabaseId}`;
      const rowId = `notion-${notionPage.notionPageId}`;
      await deleteDataSourceTableRow({ dataSourceConfig, tableId, rowId });
    }
  }
  await notionPage?.destroy();
}

export async function deleteDatabase({
  connectorId,
  dataSourceConfig,
  databaseId,
  logger,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  databaseId: string;
  logger: Logger;
}) {
  const connectorIdHash = sha256(connectorId.toString());

  if (SKIP_DELETION_CONNECTOR_ID_HASHES.has(connectorIdHash)) {
    logger.info(
      {
        action: "skip_deletion",
        resource_type: "database",
        databaseId,
        connectorId,
        connectorIdHash,
      },
      "Skipping database deletion for connector with deletion disabled"
    );
    return;
  }

  logger.info("Deleting database.");
  await deleteDataSourceDocument(
    dataSourceConfig,
    `notion-database-${databaseId}`
  );
  const notionDatabase = await NotionDatabase.findOne({
    where: {
      connectorId,
      notionDatabaseId: databaseId,
    },
  });
  if (notionDatabase) {
    const tableId = `notion-${notionDatabase.notionDatabaseId}`;
    await deleteDataSourceTable({ dataSourceConfig, tableId });
  }
  await NotionDatabase.destroy({
    where: {
      connectorId,
      notionDatabaseId: databaseId,
    },
  });
}

// - for all pages/database that have a lastSeenTs < runTimestamp
//   - query notion API and check if we can access the resource
//   - if the resource is not accessible, delete it from the database (and from the data source if it's a page)
// - update the lastGarbageCollectionFinishTime
export async function garbageCollectBatch({
  connectorId,
  batchIndex,
  runTimestamp,
}: {
  connectorId: ModelId;
  batchIndex: number;
  runTimestamp: number;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    connectorId: connector.id,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!notionConnectorState) {
    throw new Error("Could not find notionConnectorState");
  }
  const notionAccessToken = await getNotionAccessToken(connector.id);

  const NOTION_UNHEALTHY_ERROR_CODES = [
    "internal_server_error",
    "notionhq_client_request_timeout",
    "service_unavailable",
    "notionhq_client_response_error",
  ];

  let deletedPagesCount = 0;
  let deletedDatabasesCount = 0;

  let stillAccessiblePagesCount = 0;
  let stillAccessibleDatabasesCount = 0;

  const batch = await getResourcesNotSeenInGarbageCollectionRunBatch(
    connectorId,
    batchIndex
  );

  for (const [i, x] of batch.entries()) {
    await heartbeat();

    const iterationLogger = localLogger.child({
      pageId: x.type === "page" ? x.id : undefined,
      databaseId: x.type === "database" ? x.id : undefined,
      batchCount: batch.length,
      index: i,
      batchIndex: batchIndex,
      deletedPagesCount,
      deletedDatabasesCount,
      stillAccessiblePagesCount,
      stillAccessibleDatabasesCount,
    });

    let resourceIsAccessible: boolean;
    try {
      resourceIsAccessible = await isAccessibleAndUnarchived(
        notionAccessToken,
        x.id,
        x.type,
        iterationLogger
      );
    } catch (e) {
      // Sometimes a request will consistently fail with a 500 We don't want to delete the page in
      // that case, so we just log the error and move on.
      const potentialNotionError = e as {
        body: unknown;
        code: string;
        status: number;
      };
      if (
        (NOTION_UNHEALTHY_ERROR_CODES.includes(potentialNotionError.code) ||
          (typeof potentialNotionError.status === "number" &&
            potentialNotionError.status >= 500 &&
            potentialNotionError.status < 600)) &&
        Context.current().info.attempt >= 15
      ) {
        iterationLogger.error(
          {
            error: potentialNotionError,
            attempt: Context.current().info.attempt,
          },
          "Failed to check if notion resource is accessible. Giving up and moving on"
        );
        resourceIsAccessible = true;
      } else {
        throw e;
      }
    }

    if (resourceIsAccessible) {
      // Mark the resource as seen, so it is lower priority if we run into it again in a future GC run.
      if (x.type === "page") {
        await NotionPage.update(
          {
            lastSeenTs: new Date(runTimestamp),
          },
          {
            where: {
              connectorId: connector.id,
              notionPageId: x.id,
            },
          }
        );
        stillAccessiblePagesCount++;
      } else if (x.type === "database") {
        await NotionDatabase.update(
          {
            lastSeenTs: new Date(runTimestamp),
          },
          {
            where: {
              connectorId: connector.id,
              notionDatabaseId: x.id,
            },
          }
        );
        stillAccessibleDatabasesCount++;
      } else {
        assertNever(x.type);
      }
    } else {
      const dataSourceConfig = dataSourceConfigFromConnector(connector);
      if (x.type === "page") {
        await deletePage({
          connectorId: connector.id,
          dataSourceConfig,
          pageId: x.id,
          logger: iterationLogger,
        });
        deletedPagesCount++;
      } else {
        await deleteDatabase({
          connectorId: connector.id,
          dataSourceConfig,
          databaseId: x.id,
          logger: iterationLogger,
        });
        deletedDatabasesCount++;
      }
    }
  }
}

export async function completeGarbageCollectionRun(
  connectorId: ModelId,
  nbOfBatches: number
) {
  const redisKey = redisGarbageCollectorKey(connectorId);
  // Generate all the keys
  const keysToDelete = [`${redisKey}-pages`, `${redisKey}-databases`];
  for (let i = 0; i < nbOfBatches; i++) {
    keysToDelete.push(`${redisKey}-resources-not-seen-batch-${i}`);
  }

  const redisCli = await redisClient({ origin: "notion_gc" });
  // Delete all keys in one DEL command
  await redisCli.del(keysToDelete);

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!notionConnectorState) {
    throw new Error("Could not find notionConnectorState");
  }

  await notionConnectorState.update({
    lastGarbageCollectionFinishTime: new Date(),
  });
}

export async function deletePageOrDatabaseIfArchived({
  connectorId,
  objectId,
  objectType,
  loggerArgs,
}: {
  connectorId: ModelId;
  objectId: string;
  objectType: "page" | "database";
  loggerArgs: Record<string, string | number>;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const accessToken = await getNotionAccessToken(connector.id);

  const localLogger = logger.child({
    ...loggerArgs,
    objectId,
    objectType,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  if (objectType === "page") {
    const notionPageModel = await NotionPage.findOne({
      where: {
        connectorId,
        notionPageId: objectId,
      },
    });
    if (!notionPageModel) {
      logger.info("deletePageOrDatabaseIfArchived: Page not found in DB.");
      return;
    }
  }
  if (objectType === "database") {
    const notionDatabaseModel = await NotionDatabase.findOne({
      where: {
        connectorId: connector.id,
        notionDatabaseId: objectId,
      },
    });
    if (!notionDatabaseModel) {
      logger.info("deletePageOrDatabaseIfArchived: Database not found in DB.");
      return;
    }
  }

  const resourceIsAccessible = await isAccessibleAndUnarchived(
    accessToken,
    objectId,
    objectType,
    localLogger
  );

  if (!resourceIsAccessible) {
    if (objectType === "page") {
      await deletePage({
        connectorId,
        dataSourceConfig,
        pageId: objectId,
        logger: localLogger,
      });
    }
    if (objectType === "database") {
      await deleteDatabase({
        connectorId,
        dataSourceConfig,
        databaseId: objectId,
        logger: localLogger,
      });
    }
  }
}

type GCResource = {
  id: string;
  type: "page" | "database";
};

// Compute resources to check for garbage collection that weren't seen in the notion search api results
export async function createResourcesNotSeenInGarbageCollectionRunBatches({
  connectorId,
  batchSize,
}: {
  connectorId: ModelId;
  batchSize: number;
}) {
  const redisKey = redisGarbageCollectorKey(connectorId);
  const redisCli = await redisClient({ origin: "notion_gc" });

  const [pageIdsSeenInRunRaw, databaseIdsSeenInRunRaw] = await Promise.all([
    redisCli.sMembers(`${redisKey}-pages`),
    redisCli.sMembers(`${redisKey}-databases`),
  ]);

  const pageIdsSeenInRun = new Set(pageIdsSeenInRunRaw);
  const databaseIdsSeenInRun = new Set(databaseIdsSeenInRunRaw);

  const pagesNotSeenInGarbageCollectionRun = (
    await NotionPage.findAll({
      where: {
        connectorId,
        skipReason: {
          [Op.is]: null,
        },
      },
      attributes: ["lastSeenTs", "notionPageId"],
    })
  )
    .filter((p) => !pageIdsSeenInRun.has(p.notionPageId))
    .map((p) => ({
      lastSeenTs: p.lastSeenTs,
      resourceId: p.notionPageId,
      resourceType: "page" as const,
    }));

  const databasesNotSeenInGarbageCollectionRun = (
    await NotionDatabase.findAll({
      where: {
        connectorId,
        skipReason: {
          [Op.is]: null,
        },
      },
      attributes: ["lastSeenTs", "notionDatabaseId"],
    })
  )
    .filter((p) => !databaseIdsSeenInRun.has(p.notionDatabaseId))
    .map((p) => ({
      lastSeenTs: p.lastSeenTs,
      resourceId: p.notionDatabaseId,
      resourceType: "database" as const,
    }));

  const allResourcesNotSeenInGarbageCollectionRun = [
    ...pagesNotSeenInGarbageCollectionRun,
    ...databasesNotSeenInGarbageCollectionRun,
  ];

  allResourcesNotSeenInGarbageCollectionRun.sort(
    (a, b) => a.lastSeenTs.getTime() - b.lastSeenTs.getTime()
  );

  const batches: GCResource[][] = chunk(
    allResourcesNotSeenInGarbageCollectionRun.map(
      ({ resourceId, resourceType }) => ({
        // We don't need the lastSeenTs anymore, shorten keys to save space of the serialized object
        id: resourceId,
        type: resourceType,
      })
    ),
    batchSize
  );

  // Store each batch in redis
  for (const [i, batch] of batches.entries()) {
    await redisCli.set(
      `${redisKey}-resources-not-seen-batch-${i}`,
      JSON.stringify(batch)
    );
  }

  return batches.length;
}

async function getResourcesNotSeenInGarbageCollectionRunBatch(
  connectorId: ModelId,
  batchIndex: number
): Promise<GCResource[]> {
  const redisKey = redisGarbageCollectorKey(connectorId);
  const redisCli = await redisClient({ origin: "notion_gc" });

  const batch = await redisCli.get(
    `${redisKey}-resources-not-seen-batch-${batchIndex}`
  );

  if (!batch) {
    return [];
  }

  return JSON.parse(batch) as GCResource[];
}

const PARENTS_UPDATE_BATCH_SIZE = 250;

export async function updateParentsFields({
  connectorId,
  cursors,
  runTimestamp,
}: {
  connectorId: ModelId;
  cursors?: {
    pageCursor: string | null;
    databaseCursor: string | null;
  };
  runTimestamp: number;
}): Promise<{
  pageCursor: string | null;
  databaseCursor: string | null;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!notionConnectorState) {
    throw new Error("Could not find notionConnectorState");
  }

  const parentsLastUpdatedAt =
    notionConnectorState.parentsLastUpdatedAt?.getTime() || 0;

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
  });

  const baseWhereClause = {
    connectorId: connector.id,
    lastCreatedOrMovedRunTs: {
      [Op.gt]: new Date(parentsLastUpdatedAt),
    },
  };

  // cursors = undefined indicates we are in the first run
  // in which case we scroll from the beginning
  const pageWhereClause = cursors?.pageCursor
    ? {
        ...baseWhereClause,
        notionPageId: {
          [Op.gt]: cursors.pageCursor,
        },
      }
    : baseWhereClause;

  const databaseWhereClause = cursors?.databaseCursor
    ? {
        ...baseWhereClause,
        notionDatabaseId: {
          [Op.gt]: cursors.databaseCursor,
        },
      }
    : baseWhereClause;

  // pageCursor = null indicates we have finished scrolling through pages
  const notionPageIds =
    cursors?.pageCursor !== null
      ? (
          await NotionPage.findAll({
            where: pageWhereClause,
            order: [["notionPageId", "ASC"]],
            limit: PARENTS_UPDATE_BATCH_SIZE,
            attributes: ["notionPageId"],
          })
        ).map((page) => page.notionPageId)
      : [];

  // databaseCursor = null indicates we have finished scrolling through databases
  const notionDatabaseIds =
    cursors?.databaseCursor !== null
      ? (
          await NotionDatabase.findAll({
            where: databaseWhereClause,
            order: [["notionDatabaseId", "ASC"]],
            limit: PARENTS_UPDATE_BATCH_SIZE,
            attributes: ["notionDatabaseId"],
          })
        ).map((db) => db.notionDatabaseId)
      : [];

  const nextCursors: {
    pageCursor: string | null;
    databaseCursor: string | null;
  } = {
    pageCursor: notionPageIds.at(-1) ?? null,
    databaseCursor: notionDatabaseIds.at(-1) ?? null,
  };

  localLogger.info(
    {
      notionPageIdsCount: notionPageIds.length,
      notionDatabaseIdsCount: notionDatabaseIds.length,
      cursors,
    },
    "Starting parents fields update."
  );

  const nbUpdated = await updateAllParentsFields(
    connectorId,
    notionPageIds,
    notionDatabaseIds,
    runTimestamp.toString(),
    async () => heartbeat()
  );

  localLogger.info({ nbUpdated, nextCursors }, "Updated parents fields.");
  return nextCursors;
}

export async function markParentsAsUpdated({
  connectorId,
  runTimestamp,
}: {
  connectorId: ModelId;
  runTimestamp: number;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!notionConnectorState) {
    throw new Error("Could not find notionConnectorState");
  }
  await notionConnectorState.update({
    parentsLastUpdatedAt: new Date(runTimestamp),
  });
}

export async function getAllOrphanedResources({
  connectorId,
  cursor = null,
}: {
  connectorId: ModelId;
  cursor: {
    pageCursor: ModelId | null;
    databaseCursor: ModelId | null;
  } | null;
}): Promise<{
  pageIds: string[];
  databaseIds: string[];
  nextCursor: {
    pageCursor: ModelId | null;
    databaseCursor: ModelId | null;
  } | null;
}> {
  const pages =
    cursor && !cursor.pageCursor
      ? ([] as NotionPage[])
      : await NotionPage.findAll({
          where: {
            connectorId,
            parentType: "unknown",
            id: {
              [Op.gt]: cursor?.pageCursor ?? 0,
            },
          },
          attributes: ["notionPageId", "id"],
          order: [["id", "ASC"]],
          limit: 128,
        });

  const databases =
    cursor && !cursor.databaseCursor
      ? ([] as NotionDatabase[])
      : await NotionDatabase.findAll({
          where: {
            connectorId,
            parentType: "unknown",
            id: {
              [Op.gt]: cursor?.databaseCursor ?? 0,
            },
          },
          attributes: ["notionDatabaseId", "id"],
          order: [["id", "ASC"]],
          limit: 128,
        });

  const nextCursor = {
    pageCursor: pages.at(-1)?.id ?? null,
    databaseCursor: databases.at(-1)?.id ?? null,
  };

  return {
    pageIds: pages.map((page) => page.notionPageId),
    databaseIds: databases.map((db) => db.notionDatabaseId),
    nextCursor:
      nextCursor.pageCursor !== null || nextCursor.databaseCursor !== null
        ? nextCursor
        : null,
  };
}

export async function cachePage({
  connectorId,
  pageId,
  runTimestamp,
  topLevelWorkflowId,
  loggerArgs,
}: {
  connectorId: ModelId;
  pageId: string;
  runTimestamp: number;
  topLevelWorkflowId: string;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  skipped: boolean;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const accessToken = await getNotionAccessToken(connector.id);

  let localLogger = logger.child({
    ...loggerArgs,
    pageId,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  localLogger.info(
    "notionRetrievePageActivity: Retrieving page from connectors DB."
  );
  const notionPageInDb = await getNotionPageFromConnectorsDb(
    connectorId,
    pageId
  );

  const alreadySeenInRun =
    notionPageInDb?.lastSeenTs?.getTime() === runTimestamp;
  if (alreadySeenInRun) {
    localLogger.info("Skipping page already seen in this run");
    return {
      skipped: true,
    };
  }

  if (notionPageInDb?.skipReason) {
    localLogger.info(
      { skipReason: notionPageInDb.skipReason },
      "Skipping page with skip reason"
    );
    return {
      skipped: true,
    };
  }

  localLogger.info(
    "notionRetrievePageActivity: Checking if page is already in cache."
  );
  const pageInCache = await NotionConnectorPageCacheEntry.findOne({
    where: {
      notionPageId: pageId,
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
  });
  if (pageInCache) {
    localLogger.info("notionRetrievePageActivity: Page is already in cache.");
    return {
      skipped: false,
    };
  }

  localLogger.info(
    "notionRetrievePageActivity: Retrieving page from Notion API."
  );
  const notionPage = await retrievePage({
    accessToken,
    pageId,
    loggerArgs,
  });

  if (!notionPage) {
    localLogger.info("Skipping page not found");
    return {
      skipped: true,
    };
  }

  localLogger = localLogger.child({
    pageUrl: notionPage.url,
  });

  localLogger.info("notionRetrievePageActivity: Saving page in cache.");

  const parent = getPageOrBlockParent(notionPage);

  await NotionConnectorPageCacheEntry.upsert({
    notionPageId: pageId,
    connectorId: connector.id,
    pageProperties: {},
    pagePropertiesText: JSON.stringify(notionPage.properties),
    parentType: parent.type,
    parentId: parent.id,
    createdById: notionPage.created_by.id,
    lastEditedById: notionPage.last_edited_by.id,
    createdTime: notionPage.created_time,
    lastEditedTime: notionPage.last_edited_time,
    url: notionPage.url,
    workflowId: topLevelWorkflowId,
  });

  return {
    skipped: false,
  };
}

export async function cacheBlockChildren({
  connectorId,
  pageId,
  blockId,
  cursor,
  currentIndexInParent,
  loggerArgs,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageId: string;
  blockId: string | null;
  cursor: string | null;
  currentIndexInParent: number;
  loggerArgs: Record<string, string | number>;
  topLevelWorkflowId: string;
}): Promise<{
  nextCursor: string | null;
  blocksWithChildren: string[];
  blocksCount: number;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const notionPageModel = await NotionPage.findOne({
    where: {
      connectorId: connector.id,
      notionPageId: pageId,
    },
  });

  // The page might not exist yet as in the first run of the workflow as we cache block children THEN we store the page
  if (notionPageModel?.skipReason) {
    logger.info(
      { skipReason: notionPageModel.skipReason },
      "Skipping page with skip reason"
    );
    return {
      nextCursor: null,
      blocksWithChildren: [],
      blocksCount: 0,
    };
  }

  const localLogger = logger.child({
    ...loggerArgs,
    pageId,
    blockId,
    currentIndexInParent,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  const accessToken = await getNotionAccessToken(connector.id);

  localLogger.info(
    "notionBlockChildrenResultPageActivity: Retrieving result page from Notion API."
  );
  const resultPage = await retrieveBlockChildrenResultPage({
    accessToken,
    blockOrPageId: blockId || pageId,
    cursor,
    loggerArgs,
  });

  if (!resultPage) {
    localLogger.info("Skipping result page not found.");
    return {
      nextCursor: null,
      blocksWithChildren: [],
      blocksCount: 0,
    };
  }

  let parsedBlocks: ParsedNotionBlock[] = [];
  for (const block of resultPage.results) {
    if (isFullBlock(block)) {
      parsedBlocks.push(parsePageBlock(block));
    }
  }

  if (blockId) {
    // remove blocks that are already in the cache, as Notion data structure can
    // have cycles and we don't want to loop forever.
    const existingBlocks = await NotionConnectorBlockCacheEntry.findAll({
      where: {
        notionPageId: pageId,
        notionBlockId: parsedBlocks.map((b) => b.id),
        connectorId: connector.id,
        workflowId: topLevelWorkflowId,
      },
      attributes: ["notionBlockId"],
    });
    const existingBlockIds = new Set(
      existingBlocks.map((b) => b.notionBlockId)
    );
    parsedBlocks = parsedBlocks.filter((b) => !existingBlockIds.has(b.id));
  }

  const blockIds = new Set<string>();
  parsedBlocks = parsedBlocks.filter((b) => {
    if (blockIds.has(b.id)) {
      return false;
    }
    blockIds.add(b.id);
    return true;
  });

  const blocksWithChildren = parsedBlocks
    .filter((b) => b.hasChildren)
    .map((b) => b.id);

  localLogger.info(
    {
      blocksWithChildrenCount: blocksWithChildren.length,
    },
    "Found blocks with children."
  );

  localLogger.info(
    "notionBlockChildrenResultPageActivity: Saving blocks in cache."
  );
  await concurrentExecutor(
    parsedBlocks,
    async (block, idx) => {
      await NotionConnectorBlockCacheEntry.upsert({
        notionPageId: pageId,
        notionBlockId: block.id,
        blockType: block.type,
        blockText: block.text,
        parentBlockId: blockId,
        indexInParent: currentIndexInParent + idx,
        childDatabaseTitle: block.childDatabaseTitle,
        connectorId: connector.id,
        workflowId: topLevelWorkflowId,
      });
    },
    { concurrency: 4 }
  );

  return {
    blocksWithChildren,
    blocksCount: parsedBlocks.length,
    nextCursor: resultPage.next_cursor,
  };
}

async function cacheDatabaseChildPages({
  connectorId,
  topLevelWorkflowId,
  loggerArgs,
  pages,
  databaseId,
}: {
  connectorId: ModelId;
  topLevelWorkflowId: string;
  loggerArgs: Record<string, string | number>;
  pages: PageObjectResponse[];
  databaseId: string;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    ...loggerArgs,
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
  });

  const notionDatabaseModel = await NotionDatabase.findOne({
    where: {
      connectorId: connector.id,
      notionDatabaseId: databaseId,
    },
  });

  if (notionDatabaseModel?.skipReason) {
    localLogger.info(
      { skipReason: notionDatabaseModel.skipReason },
      "Skipping database with skip reason"
    );
    return;
  }

  // exclude pages that are already in the cache
  const existingPages = await NotionConnectorPageCacheEntry.findAll({
    where: {
      notionPageId: pages.map((p) => p.id),
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
    attributes: ["notionPageId"],
  });
  const existingPageIds = new Set(existingPages.map((p) => p.notionPageId));

  pages = pages.filter((p) => !existingPageIds.has(p.id));

  localLogger.info({ pagesCount: pages.length }, "Saving pages in cache.");

  // unique pages only
  const pageIds = new Set<string>();
  pages = pages.filter((p) => {
    if (pageIds.has(p.id)) {
      return false;
    }
    pageIds.add(p.id);
    return true;
  });

  await concurrentExecutor(
    pages,
    async (page) =>
      NotionConnectorPageCacheEntry.upsert({
        notionPageId: page.id,
        connectorId: connector.id,
        pageProperties: {},
        pagePropertiesText: JSON.stringify(page.properties),
        parentId: databaseId,
        parentType: "database",
        createdById: page.created_by.id,
        lastEditedById: page.last_edited_by.id,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        url: page.url,
        workflowId: topLevelWorkflowId,
      }),
    { concurrency: 5 }
  );
}

async function maybeAddParentToResourcesToCheck({
  connectorId,
  parentId,
  parentType,
  pageOrDbId,
  topLevelWorkflowId,
  loggerArgs,
}: {
  connectorId: ModelId;
  parentId: string;
  parentType: NotionConnectorPageCacheEntry["parentType"];
  pageOrDbId: string;
  topLevelWorkflowId: string;
  loggerArgs: Record<string, string | number>;
}) {
  const localLogger = logger.child({
    ...loggerArgs,
    pageOrDbId,
    parentType,
    parentId,
  });

  if (parentType === "page" || parentType === "database") {
    // check if we have the parent page/DB in the DB already. If not, we need to add it
    // to the cache of resources to check.
    localLogger.info(
      "maybeAddParentToResourcesToCheck: Retrieving parent page/DB from connectors DB."
    );

    let notionId: string | null = null;
    if (parentType === "page") {
      const existingParentPage = await NotionPage.findOne({
        where: {
          notionPageId: parentId,
          connectorId,
        },
      });
      if (!existingParentPage) {
        localLogger.info(
          "maybeAddParentToResourcesToCheck: Parent page not found in connectors DB."
        );
        notionId = parentId;
      }
    } else if (parentType === "database") {
      const existingParentDatabase = await NotionDatabase.findOne({
        where: {
          notionDatabaseId: parentId,
          connectorId,
        },
      });
      if (!existingParentDatabase) {
        localLogger.info(
          "maybeAddParentToResourcesToCheck: Parent database not found in connectors DB."
        );
        notionId = parentId;
      }
    } else {
      assertNever(parentType);
    }

    if (notionId) {
      await NotionConnectorResourcesToCheckCacheEntry.upsert({
        notionId,
        connectorId,
        resourceType: parentType,
        workflowId: topLevelWorkflowId,
      });
    }
  }
}

export async function resolveResourceParent({
  parentId,
  parentType,
  pageOrDbId,
  accessToken,
  loggerArgs,
}: {
  parentId: string;
  parentType: NotionConnectorPageCacheEntry["parentType"];
  pageOrDbId: string;
  accessToken: string;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  parentId: string;
  parentType: NotionConnectorPageCacheEntry["parentType"];
}> {
  const localLogger = logger.child({
    ...loggerArgs,
    pageOrDbId,
  });

  if (parentType === "block") {
    localLogger.info(
      "Parent is a block, attempting to find a non-block parent."
    );

    const blockParent = await getBlockParentMemoized(
      accessToken,
      parentId,
      localLogger
    );

    if (!blockParent) {
      localLogger.info("Could not retrieve block parent.");
      return {
        parentId: "unknown",
        parentType: "unknown",
      };
    }

    parentId = blockParent.parentId;
    parentType = blockParent.parentType;
  }

  if (parentType === "unknown" || parentType === "workspace") {
    return {
      parentId,
      parentType,
    };
  }

  const reachable = await isAccessibleAndUnarchived(
    accessToken,
    parentId,
    parentType,
    localLogger
  );

  if (reachable) {
    return {
      parentId,
      parentType,
    };
  }

  localLogger.info("Could not find a reachable parent");
  return {
    parentId: "unknown",
    parentType: "unknown",
  };
}

export async function renderAndUpsertPageFromCache({
  connectorId,
  pageId,
  loggerArgs,
  runTimestamp,
  isFullSync,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  pageId: string;
  loggerArgs: Record<string, string | number>;
  runTimestamp: number;
  isFullSync: boolean;
  topLevelWorkflowId: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const dsConfig = dataSourceConfigFromConnector(connector);
  const accessToken = await getNotionAccessToken(connector.id);

  const localLogger = logger.child({
    ...loggerArgs,
    pageId,
    dataSourceId: connector.dataSourceId,
    workspaceId: connector.workspaceId,
  });

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving Notion page from connectors DB."
  );
  const notionPageInDb = await getNotionPageFromConnectorsDb(
    connectorId,
    pageId
  );

  if (notionPageInDb?.skipReason) {
    localLogger.info(
      { skipReason: notionPageInDb.skipReason },
      "Skipping page with skip reason"
    );
    return;
  }

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving page from cache."
  );
  const pageCacheEntry = await NotionConnectorPageCacheEntry.findOne({
    where: {
      notionPageId: pageId,
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
  });
  if (!pageCacheEntry) {
    throw new Error("Could not find page in cache");
  }

  if (notionPageInDb?.parentType === "database" && notionPageInDb.parentId) {
    localLogger.info(
      "notionRenderAndUpsertPageFromCache: Retrieving parent database from connectors DB."
    );
    const parentDb = await NotionDatabase.findOne({
      where: {
        connectorId: connector.id,
        notionDatabaseId: notionPageInDb.parentId,
      },
    });

    if (parentDb) {
      // parentDb.upsertRequestedRunTs = noz5-

      // Only do structured data incremental sync if the DB has already been synced as structured data.
      if (parentDb.structuredDataUpsertedTs) {
        localLogger.info(
          "notionRenderAndUpsertPageFromCache: Upserting page in structured data."
        );
        const { tableId, tableName, tableDescription } =
          getTableInfoFromDatabase(parentDb);

        const { csv } = await renderDatabaseFromPages({
          databaseTitle: null,
          pagesProperties: [
            JSON.parse(
              pageCacheEntry.pagePropertiesText
            ) as PageObjectProperties,
          ],
          dustIdColumn: [pageId],
          cellSeparator: ",",
          rowBoundary: "",
        });

        const parentPageOrDbIds = await getParents(
          connector.id,
          parentDb.notionDatabaseId,
          [],
          true,
          runTimestamp.toString()
        );
        await heartbeat();

        const parents = parentPageOrDbIds.map((id) => `notion-${id}`);

        await ignoreTablesError("Notion Database", () =>
          upsertDataSourceTableFromCsv({
            dataSourceConfig: dataSourceConfigFromConnector(connector),
            tableId,
            tableName,
            tableDescription,
            tableCsv: csv,
            loggerArgs,
            // We only update the rowId of for the page without truncating the rest of the table (incremental sync).
            truncate: false,
            parents: parents,
            parentId: parents[1] || null,
            title: parentDb.title ?? "Untitled Notion Database",
            mimeType: INTERNAL_MIME_TYPES.NOTION.DATABASE,
            sourceUrl:
              parentDb.notionUrl ??
              `https://www.notion.so/${parentDb.notionDatabaseId.replace(/-/g, "")}`,
            allowEmptySchema: true,
          })
        );
      } else {
        localLogger.info(
          "notionRenderAndUpsertPageFromCache: Skipping page as parent database has not been synced as structured data."
        );
      }
    }
  }

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving blocks from cache."
  );
  const blockCacheEntries = await NotionConnectorBlockCacheEntry.findAll({
    where: {
      notionPageId: pageId,
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
  });

  const blocksByParentId: Record<string, NotionConnectorBlockCacheEntry[]> = {};
  for (const blockCacheEntry of blockCacheEntries) {
    blocksByParentId[blockCacheEntry.parentBlockId || "root"] = [
      ...(blocksByParentId[blockCacheEntry.parentBlockId || "root"] ?? []),
      blockCacheEntry,
    ];
  }

  localLogger.info("notionRenderAndUpsertPageFromCache: Rendering page.");

  let renderedPageSection = await renderPageSection({
    dsConfig,
    blocksByParentId,
    localLogger,
  });

  // add a newline to separate the page from the metadata above (title, author...)
  renderedPageSection.content = "\n";

  // Adding notion properties to the page rendering
  // We skip the title as it is added separately as prefix to the top-level document section.
  const parsedProperties = parsePageProperties(
    JSON.parse(pageCacheEntry.pagePropertiesText)
  );
  for (const p of parsedProperties.filter((p) => p.key !== "title")) {
    if (!p.value) {
      continue;
    }
    const propertyValue = Array.isArray(p.value) ? p.value.join(", ") : p.value;
    const propertyContent = `$${p.key}: ${propertyValue}\n`;
    renderedPageSection.sections.unshift({
      prefix: null,
      content: propertyContent,
      sections: [],
    });
  }

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving author and last editor from notion API."
  );
  const author =
    (await getUserName(accessToken, pageCacheEntry.createdById, localLogger)) ??
    pageCacheEntry.createdById;
  const lastEditor =
    (await getUserName(
      accessToken,
      pageCacheEntry.lastEditedById,
      localLogger
    )) ?? pageCacheEntry.lastEditedById;

  let parentType = pageCacheEntry.parentType;
  let parentId = pageCacheEntry.parentId;

  try {
    if (parentType === "block") {
      localLogger.info(
        "notionRenderAndUpsertPageFromCache: Retrieving block parent from notion API."
      );
      const blockParent = await getBlockParentMemoized(
        accessToken,
        parentId,
        localLogger,
        async () => {
          await heartbeat();
        }
      );
      if (blockParent) {
        parentType = blockParent.parentType;
        parentId = blockParent.parentId;
      }
    }
  } catch (e) {
    const attempt = Context.current().info.attempt;
    localLogger.error(
      { error: e, attempt },
      "Could not retrieve block parent from Notion API."
    );
    if (attempt < 15) {
      throw e;
    }
    localLogger.warn(
      { attempt },
      "Giving up attempts retrieve block parent (too many failures)."
    );
  }

  // checks if the parent is accessible. If that fails, returns "unknown" parent (i.e, orphaned
  // node).
  const resolvedParent = await resolveResourceParent({
    parentId,
    parentType,
    pageOrDbId: pageId,
    accessToken,
    loggerArgs: {
      ...loggerArgs,
      workspaceId: connector.workspaceId,
      dataSourceId: connector.dataSourceId,
    },
  });

  parentType = resolvedParent.parentType;
  parentId = resolvedParent.parentId;

  await maybeAddParentToResourcesToCheck({
    connectorId,
    parentId,
    parentType,
    pageOrDbId: pageId,
    topLevelWorkflowId,
    loggerArgs,
  });

  const createdOrMoved =
    parentType !== notionPageInDb?.parentType ||
    parentId !== notionPageInDb?.parentId;

  const titleProperty =
    parsedProperties.find((p) => p.type === "title") ??
    parsedProperties.find((p) => p.key === "title");

  let title = titleProperty?.value ?? undefined;
  if (Array.isArray(title)) {
    title = title.join(" ");
  }

  const initialDocumentLength = sectionLength(renderedPageSection);
  if (initialDocumentLength > MAX_DOCUMENT_TXT_LEN) {
    localLogger.warn(
      {
        renderedPageLength: initialDocumentLength,
        maxDocumentTxtLength: MAX_DOCUMENT_TXT_LEN,
      },
      "notionRenderAndUpsertPageFromCache: Truncating page with too large body."
    );

    // Not skipping the page as we want to upsert the page to make sure that we preserve
    // the node hierarchy. Instead, we truncate the page to the max length.
    renderedPageSection = truncateSection(
      renderedPageSection,
      MAX_DOCUMENT_TXT_LEN
    );
  }

  const upsertTs: number = new Date().getTime();

  const createdAt = new Date(pageCacheEntry.createdTime);
  const updatedAt = new Date(pageCacheEntry.lastEditedTime);

  const documentId = `notion-${pageId}`;
  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Fetching resource parents."
  );

  const parentPageOrDbIds = await getParents(
    connectorId,
    pageId,
    [],
    true,
    runTimestamp.toString()
  );
  await heartbeat();

  const parentIds = parentPageOrDbIds.map((id) => `notion-${id}`);
  if (parentIds.length === 1) {
    const page = await getNotionPageFromConnectorsDb(connectorId, pageId);
    localLogger.warn(
      { parentIds, parentType: page?.parentType, parentId: page?.parentId },
      "notionRenderAndUpsertPageFromCache: Page has no parent."
    );
  }

  const content = await renderDocumentTitleAndContent({
    dataSourceConfig: dsConfig,
    title: title ?? null,
    createdAt: createdAt,
    updatedAt: updatedAt,
    author,
    lastEditor,
    content: renderedPageSection,
  });

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Upserting to Data Source."
  );
  await upsertDataSourceDocument({
    dataSourceConfig: dsConfig,
    documentId,
    documentContent: content,
    documentUrl: pageCacheEntry.url,
    timestampMs: updatedAt.getTime(),
    tags: getTagsForPage({
      title,
      author,
      lastEditor,
      createdTime: createdAt.getTime(),
      updatedTime: updatedAt.getTime(),
      parsedProperties,
      logger: localLogger,
    }),
    parents: parentIds,
    parentId: parentIds[1] || null,
    loggerArgs,
    upsertContext: {
      sync_type: isFullSync ? "batch" : "incremental",
    },
    title: title ?? "",
    mimeType: INTERNAL_MIME_TYPES.NOTION.PAGE,
    async: true,
  });

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Saving page in connectors DB."
  );
  await upsertNotionPageInConnectorsDb({
    dataSourceInfo: dataSourceInfoFromConnector(connector),
    notionPageId: pageId,
    lastSeenTs: runTimestamp,
    parentType,
    parentId,
    title,
    notionUrl: pageCacheEntry.url,
    lastUpsertedTs: upsertTs,
    skipReason: undefined,
    lastCreatedOrMovedRunTs: createdOrMoved ? runTimestamp : undefined,
  });

  const childDatabaseIdsToCheck = blockCacheEntries
    .filter((b) => b.blockType === "child_database")
    .map((b) => b.notionBlockId);
  const childPageIdsToCheck = blockCacheEntries
    .filter((b) => b.blockType === "child_page")
    .map((b) => b.notionBlockId);

  const childDatabaseIdsInDb = new Set(
    (
      await NotionConnectorResourcesToCheckCacheEntry.findAll({
        where: {
          notionId: childDatabaseIdsToCheck,
          resourceType: "database",
          connectorId: connector.id,
          workflowId: topLevelWorkflowId,
        },
        attributes: ["notionId"],
      })
    ).map((r) => r.notionId)
  );
  const childPageIdsInDb = new Set(
    (
      await NotionConnectorResourcesToCheckCacheEntry.findAll({
        where: {
          notionId: childPageIdsToCheck,
          resourceType: "page",
          connectorId: connector.id,
          workflowId: topLevelWorkflowId,
        },
        attributes: ["notionId"],
      })
    ).map((r) => r.notionId)
  );

  const databaseEntriesToCreate = childDatabaseIdsToCheck.filter(
    (id) => !childDatabaseIdsInDb.has(id)
  );
  const pageEntriesToCreate = childPageIdsToCheck.filter(
    (id) => !childPageIdsInDb.has(id)
  );

  await Promise.all([
    ...databaseEntriesToCreate.map((id) =>
      NotionConnectorResourcesToCheckCacheEntry.upsert({
        notionId: id,
        resourceType: "database",
        connectorId: connector.id,
        workflowId: topLevelWorkflowId,
      })
    ),
    ...pageEntriesToCreate.map((id) =>
      NotionConnectorResourcesToCheckCacheEntry.upsert({
        notionId: id,
        resourceType: "page",
        connectorId: connector.id,
        workflowId: topLevelWorkflowId,
      })
    ),
  ]);
}

export async function clearWorkflowCache({
  connectorId,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  topLevelWorkflowId: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
  });

  localLogger.info("notionClearConnectorCacheActivity: Clearing cache.");
  await NotionConnectorPageCacheEntry.destroy({
    where: {
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
  });
  await NotionConnectorBlockCacheEntry.destroy({
    where: {
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
  });
  await NotionConnectorResourcesToCheckCacheEntry.destroy({
    where: {
      connectorId: connector.id,
      workflowId: topLevelWorkflowId,
    },
  });
}

export async function getDiscoveredResourcesFromCache({
  connectorId,
  topLevelWorkflowId,
}: {
  connectorId: ModelId;
  topLevelWorkflowId: string;
}): Promise<{ pageIds: string[]; databaseIds: string[] } | null> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
  });

  localLogger.info(
    "notionGetResourcesToCheckFromCacheActivity: Retrieving resources to check from cache."
  );

  const resourcesToCheck =
    await NotionConnectorResourcesToCheckCacheEntry.findAll({
      where: {
        connectorId: connector.id,
        workflowId: topLevelWorkflowId,
      },
    });

  const pageIdsToCheck = resourcesToCheck
    .filter((r) => r.resourceType === "page")
    .map((r) => r.notionId);
  const databaseIdsToCheck = resourcesToCheck
    .filter((r) => r.resourceType === "database")
    .map((r) => r.notionId);

  const pageIdsAlreadySeen = new Set(
    (
      await NotionPage.findAll({
        where: {
          connectorId: connector.id,
          notionPageId: pageIdsToCheck,
        },
        attributes: ["notionPageId"],
      })
    ).map((p) => p.notionPageId)
  );

  const databaseIdsAlreadySeen = new Set(
    (
      await NotionDatabase.findAll({
        where: {
          connectorId: connector.id,
          notionDatabaseId: databaseIdsToCheck,
        },
        attributes: ["notionDatabaseId"],
      })
    ).map((db) => db.notionDatabaseId)
  );

  const discoveredPageIds = pageIdsToCheck.filter(
    (id) => !pageIdsAlreadySeen.has(id)
  );
  const discoveredDatabaseIds = databaseIdsToCheck.filter(
    (id) => !databaseIdsAlreadySeen.has(id)
  );

  if (!discoveredPageIds.length && !discoveredDatabaseIds.length) {
    localLogger.info("No new resources discovered.");
    return null;
  }

  localLogger.info(
    {
      discoveredPageIdsCount: discoveredPageIds.length,
      discoveredDatabaseIdsCount: discoveredDatabaseIds.length,
    },
    "Discovered new resources."
  );

  return {
    pageIds: discoveredPageIds,
    databaseIds: discoveredDatabaseIds,
  };
}

const LONG_RENDER_BLOCK_SECTION_TIME_MS = 120000;

/** Render page sections according to Notion structure:
 * - the natural nesting of blocks is used as structure,
 * - H1, H2 & H3 blocks add a level of nesting in addition to the "natural"
 *   nesting,
 * - only the 2 first levels of nesting are used to create prefixes, similarly
 *   to github, to avoid too many prefixes (H3 is still useful since some people
 *   don't use H1 but only H2/H3, or start their doc with H3, etc.)
 */
async function renderPageSection({
  dsConfig,
  blocksByParentId,
  localLogger,
}: {
  dsConfig: DataSourceConfig;
  blocksByParentId: Record<string, NotionConnectorBlockCacheEntry[]>;
  localLogger: Logger;
}): Promise<CoreAPIDataSourceDocumentSection> {
  const renderedPageSection: CoreAPIDataSourceDocumentSection = {
    prefix: null,
    content: null,
    sections: [],
  };

  // Change block parents so that H1/H2/H3 blocks are treated as nesting
  // for that we need to traverse with a topological sort, leafs treated first
  const orderedParentIds: string[] = [];
  const visitedNodes = new Set<string>();
  const addNode = (nodeId: string) => {
    // Prevent infinite recursion on circular references
    if (visitedNodes.has(nodeId)) {
      localLogger.warn(
        `Circular reference detected in block hierarchy at node: ${nodeId}`
      );
      return;
    }
    visitedNodes.add(nodeId);

    const children = blocksByParentId[nodeId];
    if (!children) {
      return;
    }
    orderedParentIds.push(nodeId);
    for (const child of children) {
      addNode(child.notionBlockId);
    }
  };

  addNode("root");
  orderedParentIds.reverse();

  localLogger.info(
    { pagesCount: visitedNodes.size },
    "Rendered page sections."
  );

  const adaptedBlocksByParentId: Record<
    string,
    NotionConnectorBlockCacheEntry[]
  > = {};

  for (const parentId of orderedParentIds) {
    const blocks = blocksByParentId[
      parentId
    ] as NotionConnectorBlockCacheEntry[];
    blocks.sort((a, b) => a.indexInParent - b.indexInParent);
    const currentHeadings: {
      h1: string | null;
      h2: string | null;
      h3: string | null;
    } = {
      h1: null,
      h2: null,
      h3: null,
    };
    for (const block of blocks) {
      if (block.blockType === "heading_1") {
        adaptedBlocksByParentId[parentId] = [
          ...(adaptedBlocksByParentId[parentId] ?? []),
          block,
        ];
        currentHeadings.h1 = block.notionBlockId;
        currentHeadings.h2 = null;
        currentHeadings.h3 = null;
      } else if (block.blockType === "heading_2") {
        const h2ParentId = currentHeadings.h1 ?? parentId;
        adaptedBlocksByParentId[h2ParentId] = [
          ...(adaptedBlocksByParentId[h2ParentId] ?? []),
          block,
        ];
        currentHeadings.h2 = block.notionBlockId;
        currentHeadings.h3 = null;
      } else if (block.blockType === "heading_3") {
        const h3ParentId = currentHeadings.h2 ?? currentHeadings.h1 ?? parentId;
        adaptedBlocksByParentId[h3ParentId] = [
          ...(adaptedBlocksByParentId[h3ParentId] ?? []),
          block,
        ];
        currentHeadings.h3 = block.notionBlockId;
      } else {
        const currentParentId =
          currentHeadings.h3 ??
          currentHeadings.h2 ??
          currentHeadings.h1 ??
          parentId;
        adaptedBlocksByParentId[currentParentId] = [
          ...(adaptedBlocksByParentId[currentParentId] ?? []),
          block,
        ];
      }
    }
  }

  const renderingStack = new Set<string>();

  const renderBlockSection = async (
    b: NotionConnectorBlockCacheEntry,
    depth: number,
    indent = ""
  ): Promise<CoreAPIDataSourceDocumentSection> => {
    // Prevent infinite recursion on circular references
    if (renderingStack.has(b.notionBlockId)) {
      localLogger.warn(
        `Circular reference detected while rendering block: ${b.notionBlockId} at depth ${depth}`
      );
      return {
        prefix: null,
        content: `[Circular reference detected for block ${b.notionBlockId}]\n`,
        sections: [],
      };
    }
    renderingStack.add(b.notionBlockId);

    const startTime = Date.now();
    // Initial rendering (remove base64 images from rendered block)
    let renderedBlock = b.blockText ? `${indent}${b.blockText}` : "";
    renderedBlock = renderedBlock
      .trim()
      .replace(/data:image\/[^;]+;base64,[^\n]+/g, "")
      .concat("\n");
    if (
      b.blockType === "heading_1" ||
      b.blockType === "heading_2" ||
      b.blockType === "heading_3"
    ) {
      renderedBlock = "\n" + renderedBlock;
    }

    // Prefix for depths 0 and 1, and only if children
    const blockSection =
      depth < 2 && adaptedBlocksByParentId[b.notionBlockId]?.length
        ? await renderPrefixSection({
            dataSourceConfig: dsConfig,
            prefix: renderedBlock,
          })
        : {
            prefix: null,
            content: renderedBlock,
            sections: [],
          };

    // Recurse on children
    const children = adaptedBlocksByParentId[b.notionBlockId] ?? [];
    children.sort((a, b) => a.indexInParent - b.indexInParent);
    if (
      b.blockType !== "heading_1" &&
      b.blockType !== "heading_2" &&
      b.blockType !== "heading_3"
    ) {
      indent = `- ${indent}`;
    }
    for (const child of children) {
      blockSection.sections.push(
        await renderBlockSection(child, depth + 1, indent)
      );
    }

    // Remove from rendering stack after processing
    renderingStack.delete(b.notionBlockId);
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > LONG_RENDER_BLOCK_SECTION_TIME_MS) {
      localLogger.info(
        {
          elapsedTime,
          blockId: b.notionBlockId,
          blockType: b.blockType,
          depth,
          indent,
        },
        "Long renderBlockSection time."
      );
    }
    await heartbeat();
    return blockSection;
  };

  const topLevelBlocks = adaptedBlocksByParentId["root"] || [];
  topLevelBlocks.sort((a, b) => a.indexInParent - b.indexInParent);
  for (const block of topLevelBlocks) {
    renderedPageSection.sections.push(await renderBlockSection(block, 0));
  }

  localLogger.info(
    { blocksCount: topLevelBlocks.length },
    "Rendered block sections."
  );

  return renderedPageSection;
}

function redisGarbageCollectorKey(connectorId: ModelId): string {
  return `notion-garbage-collector-${connectorId}`;
}

export async function upsertDatabaseStructuredDataFromCache({
  databaseId,
  connectorId,
  topLevelWorkflowId,
  loggerArgs,
  runTimestamp,
}: {
  databaseId: string;
  connectorId: number;
  topLevelWorkflowId: string;
  loggerArgs: Record<string, string | number>;
  runTimestamp: number;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    ...loggerArgs,
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
    databaseId,
  });

  localLogger.info("Start upserting Notion Database.");

  const dbModel = await NotionDatabase.findOne({
    where: {
      connectorId,
      notionDatabaseId: databaseId,
    },
  });

  if (!dbModel) {
    localLogger.info("Structured data not not found (skipping).");
    return;
  }

  const pageCacheEntriesCount = await NotionConnectorPageCacheEntry.count({
    where: {
      parentId: databaseId,
      connectorId,
      workflowId: topLevelWorkflowId,
    },
  });

  if (!pageCacheEntriesCount) {
    localLogger.info("No pages found in cache (skipping).");
    return;
  }

  let pagesProperties: PageObjectProperties[] = [];
  let dustIdColumn: string[] = [];

  // Loop by chunks of 250 and use raw data to avoid memory issues
  const chunkSize = 250;
  let currentSizeInBytes = 0;
  for (let i = 0; i < pageCacheEntriesCount; i += chunkSize) {
    const pageCacheEntries: {
      notionPageId: string;
      pagePropertiesText: string;
    }[] = await NotionConnectorPageCacheEntry.findAll({
      attributes: ["notionPageId", "pagePropertiesText"],
      raw: true,
      where: {
        parentId: databaseId,
        connectorId,
        workflowId: topLevelWorkflowId,
      },
      limit: chunkSize,
      offset: i,
    });

    currentSizeInBytes += pageCacheEntries.reduce(
      (acc, p) => acc + p.pagePropertiesText.length,
      0
    );

    if (currentSizeInBytes > DATABASE_TO_CSV_MAX_SIZE) {
      localLogger.info(
        "Database size is too large to upsert, skipping. Action: maybe add a skipReason to avoid even trying."
      );
      return;
    }

    pagesProperties = pagesProperties.concat(
      pageCacheEntries.map((p) => JSON.parse(p.pagePropertiesText))
    );

    dustIdColumn = dustIdColumn.concat(
      pageCacheEntries.map((p) => p.notionPageId)
    );
  }

  const { csv } = await renderDatabaseFromPages({
    databaseTitle: null,
    pagesProperties,
    dustIdColumn,
    cellSeparator: ",",
    rowBoundary: "",
  });

  const { databaseName, tableId, tableName, tableDescription } =
    getTableInfoFromDatabase(dbModel);

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  const upsertAt = new Date();

  const parentPageOrDbIds = await getParents(
    connector.id,
    databaseId,
    [],
    true,
    runTimestamp.toString()
  );
  await heartbeat();

  const parentIds = parentPageOrDbIds.map((id) => `notion-${id}`);

  localLogger.info("Upserting Notion Database as Table.");

  await ignoreTablesError("Notion Database", () =>
    upsertDataSourceTableFromCsv({
      dataSourceConfig,
      tableId,
      tableName,
      tableDescription,
      tableCsv: csv,
      loggerArgs,
      // We always cache all the child pages of a DB while we iterate over them,
      // so we can safely truncate the table.
      truncate: true,
      parents: parentIds,
      parentId: parentIds[1] || null,
      title: dbModel.title ?? "Untitled Notion Database",
      mimeType: INTERNAL_MIME_TYPES.NOTION.DATABASE,
      sourceUrl:
        dbModel.notionUrl ??
        `https://www.notion.so/${dbModel.notionDatabaseId.replace(/-/g, "")}`,
      allowEmptySchema: true,
    })
  );

  // Same as above, but without the `dustId` column
  const { csv: csvForDocument, originalHeader: headerForDocument } =
    await renderDatabaseFromPages({
      databaseTitle: null,
      pagesProperties,
      cellSeparator: ",",
      rowBoundary: "",
    });
  const csvHeader = headerForDocument.join(",");
  const csvRows = csvForDocument.split("\n").slice(1).join("\n");
  if (csvForDocument.length > MAX_DOCUMENT_TXT_LEN) {
    localLogger.info(
      {
        csvLength: csvForDocument.length,
        // 2MB (max size allowed in `front`) at the time of writing
        maxDocumentTxtLength: 2_000_000,
      },
      "Skipping document upsert as body is too long."
    );
  } else {
    // We also include a text document (not table) with a CSV reprensentation of the database.
    localLogger.info("Upserting Notion Database as Document.");
    const prefix = `${databaseName}\n${csvHeader}\n`;
    const prefixSection = await renderPrefixSection({
      dataSourceConfig,
      prefix,
      maxPrefixTokens: MAX_PREFIX_TOKENS * 2,
      maxPrefixChars: MAX_PREFIX_CHARS * 2,
    });
    if (!prefixSection.content) {
      // We use a special id for the document to avoid conflicts with the table.
      const databaseDocId = `notion-database-${databaseId}`;
      await upsertDataSourceDocument({
        dataSourceConfig,
        documentId: databaseDocId,
        documentContent: {
          prefix: prefixSection.prefix,
          content: csvRows,
          sections: [],
        },
        documentUrl:
          dbModel.notionUrl ??
          `https://www.notion.so/${databaseId.replace(/-/g, "")}`,
        // TODO: see if we actually want to use the Notion last edited time of the database
        // we currently don't have it because we don't fetch the DB object from notion.
        timestampMs: upsertAt.getTime(),
        tags: [`title:${databaseName}`, "is_database:true"],
        // The parents end up including the special ID for the document, the node ID of the database, and the parents of the database.
        parents: [databaseDocId, ...parentIds],
        // The direct parent ID is the node ID of the database.
        parentId: `notion-${databaseId}`,
        loggerArgs,
        upsertContext: {
          sync_type: "batch",
        },
        title: databaseName,
        mimeType: INTERNAL_MIME_TYPES.NOTION.DATABASE,
        async: true,
      });
    } else {
      localLogger.info(
        {
          prefix: prefixSection.prefix,
        },
        "Skipping document upsert as prefix is too long."
      );
    }
  }

  localLogger.info("Done upserting Notion Database.");

  await dbModel.update({ structuredDataUpsertedTs: upsertAt });
}

export async function logMaxSearchPageIndexReached({
  connectorId,
  searchPageIndex,
  maxSearchPageIndex,
}: {
  connectorId: ModelId;
  searchPageIndex: number;
  maxSearchPageIndex: number;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
    maxSearchPageIndex,
    connectorId,
    searchPageIndex,
  });

  localLogger.info("Max search page index reached.");
}

function getTableInfoFromDatabase(database: NotionDatabase): {
  databaseName: string;
  tableId: string;
  tableName: string;
  tableDescription: string;
} {
  const tableId = getNotionDatabaseTableId(database.notionDatabaseId);
  const fallbackName = `Untitled Database (${database.notionDatabaseId})`;

  let tableName = slugify((database.title ?? "").substring(0, 32));
  if (!tableName) {
    tableName = slugify(fallbackName.substring(0, 32));
  }

  const tableDescription = `Structured data from Notion Database ${tableName}`;
  return {
    databaseName: database.title || fallbackName,
    tableId,
    tableName,
    tableDescription,
  };
}

export async function updateSingleDocumentParents({
  connectorId,
  notionDocumentId,
  documentType,
}: {
  connectorId: ModelId;
  notionDocumentId: string;
  documentType: "page" | "database";
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const parentsNotionIds = await getParents(
    connectorId,
    notionDocumentId,
    [],
    false,
    undefined
  );

  logger.info(
    { parents: parentsNotionIds, documentId: notionDocumentId, documentType },
    "Parents for document"
  );

  const parents = parentsNotionIds.map((id) => nodeIdFromNotionId(id));

  if (documentType === "page") {
    await updateDataSourceDocumentParents({
      dataSourceConfig,
      documentId: nodeIdFromNotionId(notionDocumentId),
      parents,
      parentId: parents[1] || null,
    });
  } else if (documentType === "database") {
    await updateDataSourceTableParents({
      dataSourceConfig,
      tableId: nodeIdFromNotionId(notionDocumentId),
      parents,
      parentId: parents[1] || null,
    });
  }
}

type NotionParentType = "workspace" | "database" | "page" | "unknown";

export async function getParentPageOrDb({
  connectorId,
  pageOrDbId,
}: {
  connectorId: ModelId;
  pageOrDbId: string;
}): Promise<{ parentId: string; parentType: NotionParentType } | null> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const notionAccessToken = await getNotionAccessToken(connector.id);

  if (!notionAccessToken) {
    throw new Error("Unreachable: connection id without access token");
  }

  const page = await retrievePage({
    accessToken: notionAccessToken,
    pageId: pageOrDbId,
    loggerArgs: { connectorId },
  });
  if (page) {
    switch (page.parent.type) {
      case "database_id":
        return { parentId: page.parent.database_id, parentType: "database" };
      case "page_id":
        return { parentId: page.parent.page_id, parentType: "page" };
      case "workspace":
        return { parentId: "workspace", parentType: "workspace" };
      case "block_id":
        return (
          (await getBlockParentMemoized(
            notionAccessToken,
            page.parent.block_id,
            logger,
            () => heartbeat()
          )) ?? { parentId: "unknown", parentType: "unknown" }
        );
      default:
        ((pageParent: never) => {
          logger.warn({ pageParent }, "Unknown page parent type.");
        })(page.parent);
        return { parentId: "unknown", parentType: "unknown" };
    }
  }

  const db = await getParsedDatabase(notionAccessToken, pageOrDbId, {
    connectorId,
  });

  if (db) {
    if (db.parentType === "block") {
      return (
        (await getBlockParentMemoized(
          notionAccessToken,
          db.parentId,
          logger,
          () => heartbeat()
        )) ?? { parentId: "unknown", parentType: "unknown" }
      );
    }
    return { parentId: db.parentId, parentType: db.parentType };
  }
  logger.warn(
    { connectorId, pageOrDbId },
    "Could not find page or database in Notion."
  );
  return null;
}

export async function maybeUpdateOrphaneResourcesParents({
  connectorId,
  resources,
}: {
  connectorId: ModelId;
  resources: Array<{
    type: "page" | "database";
    notionId: string;
  }>;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    connectorId,
    workspaceId: connector.workspaceId,
    dataSourceId: connector.dataSourceId,
  });

  for (const resource of resources) {
    const iterationLogger = localLogger.child({
      resourceId: resource.notionId,
      resourceType: resource.type,
    });

    iterationLogger.info("Checking parent for resource.");

    const parent = await getParentPageOrDb({
      connectorId,
      pageOrDbId: resource.notionId,
    });

    const parentObject =
      parent?.parentType === "page"
        ? await getNotionPageFromConnectorsDb(connectorId, parent.parentId)
        : parent?.parentType === "database"
          ? await getNotionDatabaseFromConnectorsDb(
              connectorId,
              parent.parentId
            )
          : parent?.parentType === "workspace"
            ? {
                parentId: "workspace" as const,
                parentType: "workspace" as const,
              }
            : null;

    if (!parent || !parentObject) {
      // We don't have the parent in our DB.
      iterationLogger.info(
        {
          parentId: parent?.parentId,
          parentType: parent?.parentType,
        },
        "Parent not found in our DB."
      );
      continue;
    }

    iterationLogger.info(
      {
        parentId: parent.parentId,
        parentType: parent.parentType,
      },
      "Parent found in our DB. Updating resource."
    );

    const updateParams = {
      parentId: parent.parentId,
      parentType: parent.parentType,
      lastCreatedOrMovedRunTs: new Date(),
    };

    if (resource.type === "page") {
      await NotionPage.update(updateParams, {
        where: {
          notionPageId: resource.notionId,
          connectorId,
        },
      });
    } else if (resource.type === "database") {
      await NotionDatabase.update(updateParams, {
        where: {
          notionDatabaseId: resource.notionId,
          connectorId,
        },
      });
    }

    iterationLogger.info("Updated parent for resource.");
  }
}

export async function clearParentsLastUpdatedAt({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId,
    },
  });
  if (!connector || !notionConnectorState) {
    throw new Error("Could not find notion connector state");
  }

  logger.info(
    {
      connectorId,
      workspaceId: connector.workspaceId,
      dataSourceId: connector.dataSourceId,
      provider: "notion",
    },
    "Clearing parents last updated at"
  );

  await notionConnectorState.update({ parentsLastUpdatedAt: null });
}

// Finds the next database to upsert for the connector.
// Only considers databases that were requested to be upserted
// (upsertRequestedRunTs is not null and greater than lastUpsertedRunTs).
// Prioritizes databases never upserted.
// Otherwise, prioritizes databases that were requested to be upserted first.
// Returns null if all databases have been upserted in the last DATABASE_PROCESSING_INTERVAL_MS.
export async function getNextDatabaseToUpsert({
  connectorId,
}: {
  connectorId: ModelId;
}): Promise<string | null> {
  // We only consider databases that were requested to be upserted.

  // Look if we have notion DBs that were never upserted.
  // If so, return the oldest one.
  let notionDatabases = await NotionDatabase.findAll({
    where: {
      connectorId,
      lastUpsertedRunTs: {
        [Op.is]: null,
      },
      upsertRequestedRunTs: {
        [Op.not]: null,
      },
    },
    order: [
      ["upsertRequestedRunTs", "ASC"],
      ["id", "ASC"],
    ],
    limit: 1,
  });

  if (notionDatabases.length) {
    return notionDatabases[0]!.notionDatabaseId;
  }

  // Otherwise, look if we have notion DBs that were upserted more than DATABASE_PROCESSING_INTERVAL_MS ago.
  // If so, return the oldest one.
  notionDatabases = await NotionDatabase.findAll({
    where: {
      connectorId,
      lastUpsertedRunTs: {
        [Op.lt]: new Date(Date.now() - DATABASE_PROCESSING_INTERVAL_MS),
      },
      upsertRequestedRunTs: {
        // Only consider if upsertRequestedRunTs is more recent than lastUpsertedRunTs.
        [Op.and]: [
          {
            [Op.not]: null,
          },
          {
            [Op.gt]: {
              [Op.col]: "lastUpsertedRunTs",
            },
          },
        ],
      },
    },
    order: [
      ["upsertRequestedRunTs", "ASC"],
      ["id", "ASC"],
    ],
    limit: 1,
  });

  if (notionDatabases.length) {
    return notionDatabases[0]!.notionDatabaseId;
  }

  // Otherwise, we don't update any DBs for now.
  return null;
}

// Marks a database as upserted.
export async function markDatabasesAsUpserted({
  connectorId,
  databaseIds,
  runTimestamp,
}: {
  connectorId: ModelId;
  databaseIds: string[];
  runTimestamp: number;
}): Promise<{ isNewDatabase: boolean; isMissing: boolean }> {
  const db = await NotionDatabase.findOne({
    where: {
      connectorId,
      notionDatabaseId: {
        [Op.in]: databaseIds,
      },
    },
  });

  if (!db) {
    return { isNewDatabase: false, isMissing: true };
  }

  await NotionDatabase.update(
    {
      lastUpsertedRunTs: new Date(runTimestamp),
    },
    {
      where: {
        connectorId,
        notionDatabaseId: {
          [Op.in]: databaseIds,
        },
      },
    }
  );

  return { isNewDatabase: !db.lastUpsertedRunTs, isMissing: false };
}

export async function getResourcesFromGCSFile({
  gcsFilePath,
}: {
  gcsFilePath: string;
}): Promise<
  Array<{
    resourceId: string;
    resourceType: "page" | "database";
  }>
> {
  const logger = mainLogger.child({ gcsFilePath });

  const storage = new Storage({
    keyFilename: isDevelopment()
      ? connectorsConfig.getServiceAccount()
      : undefined,
  });
  const bucket = storage.bucket(connectorsConfig.getDustTmpSyncBucketName());

  try {
    // Validate file metadata for security
    const file = bucket.file(gcsFilePath);
    const [metadata] = await file.getMetadata();

    // Check if this is a Dust internal file
    if (metadata.metadata?.dustInternal !== "notion-accessibility-check") {
      throw new Error(
        "Invalid file: not a Dust internal accessibility check file"
      );
    }

    const [content] = await file.download();

    const lines = content.toString().trim().split("\n");

    // Validate file has content (at least header + 1 data line)
    if (lines.length < 2) {
      throw new Error(
        `GCS file ${gcsFilePath} is empty or only contains header`
      );
    }

    const resources: Array<{
      resourceId: string;
      resourceType: "page" | "database";
    }> = [];

    // Skip header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line || !line.trim()) {
        continue;
      }

      const [resourceId, resourceType] = line.split(",").map((s) => s.trim());
      if (
        resourceId &&
        (resourceType === "page" || resourceType === "database")
      ) {
        resources.push({
          resourceId,
          resourceType: resourceType as "page" | "database",
        });
      }
    }

    // Ensure we found at least one valid resource
    if (resources.length === 0) {
      throw new Error(`No valid resources found in GCS file ${gcsFilePath}`);
    }

    logger.info(
      { resourceCount: resources.length },
      "[NOTION_RESOURCE_CHECK] Loaded resources from GCS file"
    );

    return resources;
  } catch (error) {
    logger.error({ error }, "Failed to read resources from GCS file");
    throw new Error(`Failed to read GCS file: ${gcsFilePath}`);
  }
}

export async function checkResourceAccessibility({
  connectorId,
  resourceId,
  resourceType,
}: {
  connectorId: ModelId;
  resourceId: string;
  resourceType: "page" | "database";
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const loggerArgs = { connectorId, resourceId };

  try {
    const notionAccessToken = await getNotionAccessToken(connectorId);

    if (resourceType === "page") {
      // Check as a page
      const page = await retrievePage({
        accessToken: notionAccessToken,
        pageId: resourceId,
        loggerArgs,
      });

      logger.info(
        {
          connectorId,
          resourceId,
          resourceType: "page",
          isAccessible: !!page,
        },
        "[NOTION_RESOURCE_CHECK] Checked resource"
      );
    } else {
      // Check as a database
      const db = await getParsedDatabase(
        notionAccessToken,
        resourceId,
        loggerArgs
      );

      logger.info(
        {
          connectorId,
          resourceId,
          resourceType: "database",
          isAccessible: !!db,
        },
        "[NOTION_RESOURCE_CHECK] Checked resource"
      );
    }
  } catch (error) {
    // Let the error propagate so Temporal can handle retries based on error type
    logger.error(
      { ...loggerArgs, error },
      "Error checking resource accessibility"
    );
    throw error;
  }
}
