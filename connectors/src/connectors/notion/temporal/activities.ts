import {
  CoreAPIDataSourceDocumentSection,
  ModelId,
  sectionFullText,
} from "@dust-tt/types";
import { isFullBlock, isFullPage, isNotionClientError } from "@notionhq/client";
import { Context } from "@temporalio/activity";
import { Op } from "sequelize";

import { notionConfig } from "@connectors/connectors/notion/lib/config";
import {
  getNotionDatabaseFromConnectorsDb,
  getNotionPageFromConnectorsDb,
  upsertNotionDatabaseInConnectorsDb,
  upsertNotionPageInConnectorsDb,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import {
  GARBAGE_COLLECT_MAX_DURATION_MS,
  isDuringGarbageCollectStartWindow,
} from "@connectors/connectors/notion/lib/garbage_collect";
import {
  getBlockParentMemoized,
  getDatabaseChildPages,
  getPageOrBlockParent,
  getPagesAndDatabasesEditedSince,
  getParsedDatabase,
  getUserName,
  isAccessibleAndUnarchived,
  parsePageBlock,
  parsePageProperties,
  renderChildDatabaseFromPages,
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
  PageObjectProperties,
  ParsedNotionBlock,
} from "@connectors/connectors/notion/lib/types";
import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  renderPrefixSection,
  sectionLength,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { ExternalOauthTokenError } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import {
  NotionConnectorBlockCacheEntry,
  NotionConnectorPageCacheEntry,
  NotionConnectorResourcesToCheckCacheEntry,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models/notion";
import { getAccessTokenFromNango } from "@connectors/lib/nango_helpers";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";

const { getRequiredNangoNotionConnectorId } = notionConfig;

const logger = mainLogger.child({ provider: "notion" });

const GARBAGE_COLLECTION_INTERVAL_HOURS = 12;

export async function fetchDatabaseChildPages({
  connectorId,
  databaseId,
  cursor,
  loggerArgs,
  excludeUpToDatePages,
  runTimestamp,
}: {
  connectorId: ModelId;
  databaseId: string;
  cursor: string | null;
  loggerArgs: Record<string, string | number>;
  excludeUpToDatePages: boolean;
  runTimestamp: number;
}): Promise<{
  pageIds: string[];
  nextCursor: string | null;
}> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const notionDbModel = await NotionDatabase.findOne({
    where: {
      connectorId: connector.id,
      notionDatabaseId: databaseId,
    },
  });
  const isDbFirstSync =
    !notionDbModel ||
    !notionDbModel.firstSeenTs ||
    notionDbModel.firstSeenTs.getTime() === runTimestamp;

  const accessToken = await getNotionAccessToken(connector.connectionId);

  const localLoggerArgs = {
    ...loggerArgs,
    databaseId,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  };
  const localLogger = logger.child(localLoggerArgs);

  let res;
  try {
    res = await getDatabaseChildPages({
      notionAccessToken: accessToken,
      databaseId,
      loggerArgs: localLoggerArgs,
      cursor,
    });
  } catch (e) {
    // Sometimes a cursor will consistently fail with 500.
    // In this case, there is not much we can do, so we just give up and move on.
    // Notion workspaces are resynced daily so nothing is lost forever.
    const potentialNotionError = e as {
      body: unknown;
      code: string;
      status: number;
    };
    if (
      potentialNotionError.code === "internal_server_error" &&
      potentialNotionError.status === 500
    ) {
      if (Context.current().info.attempt > 20) {
        localLogger.error(
          {
            error: potentialNotionError,
            attempt: Context.current().info.attempt,
          },
          "Failed to get Notion database children result page with cursor. Giving up and moving on"
        );
        return {
          pageIds: [],
          nextCursor: null,
        };
      }
    }

    throw e;
  }

  const { pages, nextCursor } = res;

  if (!excludeUpToDatePages || isDbFirstSync) {
    return {
      pageIds: pages.map((p) => p.id),
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
  cursor,
  excludeUpToDatePages,
  loggerArgs,
}: {
  connectorId: ModelId;
  lastSyncedAt: number | null;
  cursor: string | null;
  excludeUpToDatePages: boolean;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  pageIds: string[];
  databaseIds: string[];
  nextCursor: string | null;
}> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    ...loggerArgs,
    connectorId: connector.id,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  });

  const accessToken = await getNotionAccessToken(connector.connectionId);

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
    res = await getPagesAndDatabasesEditedSince(
      accessToken,
      lastSyncedAt,
      cursor,
      {
        ...loggerArgs,
        dataSourceName: connector.dataSourceName,
        workspaceId: connector.workspaceId,
      },
      skippedDatabaseIds
    );
  } catch (e) {
    if (isNotionClientError(e)) {
      // Sometimes a cursor will consistently fail with 500.
      // In this case, there is not much we can do, so we just give up and move on.
      // Notion workspaces are resynced daily so nothing is lost forever.
      switch (e.code) {
        case "internal_server_error":
          if (Context.current().info.attempt > 20) {
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
          break;

        case "unauthorized":
          throw new ExternalOauthTokenError(e);

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

export async function upsertDatabase(
  connectorId: ModelId,
  databaseId: string,
  runTimestamp: number,
  loggerArgs: Record<string, string | number>
): Promise<void> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const accessToken = await getNotionAccessToken(connector.connectionId);

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

  const parsedDb = await getParsedDatabase(accessToken, databaseId, loggerArgs);

  const createdOrMoved =
    parsedDb?.parentType !== notionDatabase?.parentType ||
    parsedDb?.parentId !== notionDatabase?.parentId;

  await upsertNotionDatabaseInConnectorsDb({
    connectorId,
    notionDatabaseId: databaseId,
    runTimestamp,
    parentType: parsedDb ? parsedDb.parentType : null,
    parentId: parsedDb ? parsedDb.parentId : null,
    title: parsedDb ? parsedDb.title : null,
    notionUrl: parsedDb ? parsedDb.url : null,
    lastCreatedOrMovedRunTs: createdOrMoved ? runTimestamp : undefined,
  });
}

export async function saveSuccessSync(connectorId: ModelId) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function saveStartSync(connectorId: ModelId) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });

  if (!connector) {
    throw new Error("Could not find connector");
  }
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function getNotionAccessToken(
  nangoConnectionId: string
): Promise<string> {
  const notionAccessToken = await getAccessTokenFromNango({
    connectionId: nangoConnectionId,
    integrationId: getRequiredNangoNotionConnectorId(),
    useCache: true,
  });

  return notionAccessToken;
}

export async function shouldGarbageCollect(
  connectorId: ModelId
): Promise<boolean> {
  if (!isDuringGarbageCollectStartWindow()) {
    // Never garbage collect if we are not in the start window
    return false;
  }

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
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
    return false;
  }

  const now = new Date().getTime();

  // If we have never done a garbage collection, we should start one
  // if it has been more than GARBAGE_COLLECTION_INTERVAL_HOURS since the first successful sync
  if (!notionConnectorState.lastGarbageCollectionFinishTime) {
    return (
      now - firstSuccessfulSyncTime.getTime() >=
      GARBAGE_COLLECTION_INTERVAL_HOURS * 60 * 60 * 1000
    );
  }

  const lastGarbageCollectionFinishTime =
    notionConnectorState.lastGarbageCollectionFinishTime.getTime();

  // if we garbage collected less than GARBAGE_COLLECTION_INTERVAL_HOURS ago, we should not start another one
  if (
    now - lastGarbageCollectionFinishTime <=
    GARBAGE_COLLECTION_INTERVAL_HOURS * 60 * 60 * 1000
  ) {
    return false;
  }

  return true;
}

// marks all the pageIds and databaseIds as seen in the database (so we know we don't need
// to delete them)
export async function garbageCollectorMarkAsSeen({
  connectorId,
  pageIds,
  databaseIds,
  runTimestamp,
}: {
  connectorId: ModelId;
  pageIds: string[];
  databaseIds: string[];
  runTimestamp: number;
}): Promise<{ newPageIds: string[]; newDatabaseIds: string[] }> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  });

  await NotionPage.update(
    { lastSeenTs: new Date(runTimestamp) },
    { where: { notionPageId: pageIds, connectorId: connector.id } }
  );

  await NotionDatabase.update(
    { lastSeenTs: new Date(runTimestamp) },
    { where: { notionDatabaseId: databaseIds, connectorId: connector.id } }
  );

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
  localLogger.info(
    { newPagesCount: newPageIds.length },
    "Found new pages to sync."
  );

  const existingDatabaseIds = new Set(
    (
      await NotionDatabase.findAll({
        where: {
          notionDatabaseId: pageIds,
          connectorId: connector.id,
          skipReason: {
            [Op.is]: null,
          },
        },
        attributes: ["notionDatabaseId"],
      })
    ).map((page) => page.notionDatabaseId)
  );

  const newDatabaseIds = databaseIds.filter(
    (databaseId) => !existingDatabaseIds.has(databaseId)
  );
  localLogger.info(
    { newDatabasesCount: newDatabaseIds.length },
    "Found new databases to sync."
  );

  return { newPageIds, newDatabaseIds };
}

// - for all pages that have a lastSeenTs < runTimestamp
//   - query notion API and check if the page still exists
//   - if the page does not exist, delete it from the database
// - for all databases that have a lastSeenTs < runTimestamp
//   - query notion API and check if the database still exists
//   - if the database does not exist, delete it from the database
// - update the lastGarbageCollectionFinishTime
// - will give up after `GARBAGE_COLLECT_MAX_DURATION_MS` milliseconds (including retries if any)
export async function garbageCollect({
  connectorId,
  runTimestamp,
  startTs,
}: {
  connectorId: ModelId;
  runTimestamp: number;
  startTs: number;
}) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  });

  const notionConnectorState = await NotionConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!notionConnectorState) {
    throw new Error("Could not find notionConnectorState");
  }
  const notionAccessToken = await getNotionAccessToken(connector.connectionId);

  const pagesToDelete = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
      // Only look at pages that have not been seen since the last garbage collection.
      lastSeenTs: {
        [Op.lt]: new Date(runTimestamp),
      },
    },
    // First handle pages that we have seen the longest time ago. If the garbage collection time
    // outs that means we've cleaned-up the oldest page first and will have a chance to continue at
    // next garbage collection.
    order: [["lastSeenTs", "ASC"]],
  });
  const databasesToDelete = await NotionDatabase.findAll({
    where: {
      connectorId: connector.id,
      // Only look at pages that have not been seen since the last garbage collection.
      lastSeenTs: {
        [Op.lt]: new Date(runTimestamp),
      },
    },
    // First handle pages that we have seen the longest time ago. If the garbage collection time
    // outs that means we've cleaned-up the oldest page first and will have a chance to continue at
    // next garbage collection.
    order: [["lastSeenTs", "ASC"]],
  });

  localLogger.info(
    {
      pagesToDeleteCount: pagesToDelete.length,
      databasesToDeleteCount: databasesToDelete.length,
    },
    "Found pages and databases to delete."
  );

  const NOTION_UNHEALTHY_ERROR_CODES = [
    "internal_server_error",
    "notionhq_client_request_timeout",
    "service_unavailable",
    "notionhq_client_response_error",
  ];

  // Handle Pages.

  let deletedPagesCount = 0;
  let skippedPagesCount = 0;
  let stillAccessiblePagesCount = 0;

  for (const [i, page] of pagesToDelete.entries()) {
    const iterationLogger = localLogger.child({
      pageId: page.notionPageId,
      pagesToDeleteCount: pagesToDelete.length,
      index: i,
      deletedPagesCount,
      skippedPagesCount,
      stillAccessiblePagesCount,
    });

    if (new Date().getTime() - startTs > GARBAGE_COLLECT_MAX_DURATION_MS) {
      iterationLogger.warn("Garbage collection is taking too long, giving up.");
      break;
    }

    if (page.skipReason) {
      iterationLogger.info(
        { skipReason: page.skipReason },
        "Page is marked as skipped, not deleting."
      );
      skippedPagesCount++;
      continue;
    }

    let pageIsAccessible: boolean;
    try {
      pageIsAccessible = await isAccessibleAndUnarchived(
        notionAccessToken,
        page.notionPageId,
        "page",
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
          "Failed to check if page is accessible. Giving up and moving on"
        );
        pageIsAccessible = true;
      } else {
        throw e;
      }
    }

    if (pageIsAccessible) {
      // Mark the page as seen.
      await page.update({
        lastSeenTs: new Date(runTimestamp),
      });
      iterationLogger.info("Page is still accessible, not deleting.");
      stillAccessiblePagesCount++;
      continue;
    }

    iterationLogger.info("Deleting page.");
    await deleteFromDataSource(
      {
        dataSourceName: connector.dataSourceName,
        workspaceId: connector.workspaceId,
        workspaceAPIKey: connector.workspaceAPIKey,
      },
      `notion-${page.notionPageId}`
    );
    await page.destroy();

    deletedPagesCount++;
  }

  // Handle Databases.

  let deletedDatabasesCount = 0;
  let skippedDatabasesCount = 0;
  let stillAccessibleDatabasesCount = 0;

  for (const [i, database] of databasesToDelete.entries()) {
    const iterationLogger = localLogger.child({
      databaseId: database.notionDatabaseId,
      databasesToDeleteCount: databasesToDelete.length,
      index: i,
      deletedDatabasesCount,
      skippedDatabasesCount,
      stillAccessibleDatabasesCount,
    });

    if (new Date().getTime() - startTs > GARBAGE_COLLECT_MAX_DURATION_MS) {
      iterationLogger.warn("Garbage collection is taking too long, giving up.");
      break;
    }

    if (database.skipReason) {
      iterationLogger.info(
        { skipReason: database.skipReason },
        "Database is marked as skipped, not deleting."
      );
      skippedDatabasesCount++;
      continue;
    }

    let databaseIsAccessible: boolean;
    try {
      databaseIsAccessible = await isAccessibleAndUnarchived(
        notionAccessToken,
        database.notionDatabaseId,
        "database",
        iterationLogger
      );
    } catch (e) {
      // Sometimes a request will consistently fail with a 500 We don't want to delete the database
      // in that case, so we just log the error and move on.
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
          "Failed to check if database is accessible. Giving up and moving on"
        );
        databaseIsAccessible = true;
      } else {
        throw e;
      }
    }

    if (databaseIsAccessible) {
      // Mark the database as seen.
      await database.update({
        lastSeenTs: new Date(runTimestamp),
      });
      iterationLogger.info("Database is still accessible, not deleting.");
      stillAccessibleDatabasesCount++;
      continue;
    }

    iterationLogger.info("Deleting database.");
    await database.destroy();

    deletedDatabasesCount++;
  }

  await notionConnectorState.update({
    lastGarbageCollectionFinishTime: new Date(),
  });
}

export async function updateParentsFields(
  connectorId: ModelId,
  runTimestamp: number,
  activityExecutionTimestamp: number
) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  });

  const notionPageIds = (
    await NotionPage.findAll({
      where: {
        connectorId: connector.id,
        lastCreatedOrMovedRunTs: runTimestamp,
      },
      attributes: ["notionPageId"],
    })
  ).map((page) => page.notionPageId);

  const notionDatabaseIds = (
    await NotionDatabase.findAll({
      where: {
        connectorId: connector.id,
        lastCreatedOrMovedRunTs: runTimestamp,
      },
      attributes: ["notionDatabaseId"],
    })
  ).map((db) => db.notionDatabaseId);

  localLogger.info(
    {
      notionPageIdsCount: notionPageIds.length,
      notionDatabaseIdsCount: notionDatabaseIds.length,
    },
    "Starting parents fields update."
  );

  const nbUpdated = await updateAllParentsFields(
    connectorId,
    notionPageIds,
    notionDatabaseIds,
    activityExecutionTimestamp.toString()
  );

  localLogger.info({ nbUpdated }, "Updated parents fields.");
}

export async function cachePage({
  connectorId,
  pageId,
  runTimestamp,
  loggerArgs,
}: {
  connectorId: ModelId;
  pageId: string;
  runTimestamp: number;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  skipped: boolean;
}> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const accessToken = await getNotionAccessToken(connector.connectionId);

  let localLogger = logger.child({
    ...loggerArgs,
    pageId,
    dataSourceName: connector.dataSourceName,
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
    pagePropertiesText: ((p: PageObjectProperties) => JSON.stringify(p))(
      notionPage.properties
    ),
    parentType: parent.type,
    parentId: parent.id,
    createdById: notionPage.created_by.id,
    lastEditedById: notionPage.last_edited_by.id,
    createdTime: notionPage.created_time,
    lastEditedTime: notionPage.last_edited_time,
    url: notionPage.url,
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
}: {
  connectorId: ModelId;
  pageId: string;
  blockId: string | null;
  cursor: string | null;
  currentIndexInParent: number;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  nextCursor: string | null;
  blocksWithChildren: string[];
  childDatabases: string[];
  blocksCount: number;
}> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const accessToken = await getNotionAccessToken(connector.connectionId);

  const localLogger = logger.child({
    ...loggerArgs,
    pageId,
    blockId,
    currentIndexInParent,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  });

  localLogger.info(
    "notionBlockChildrenResultPageActivity: Retrieving connector."
  );

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
      childDatabases: [],
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

  const childDatabases = parsedBlocks
    .filter((b) => b.type === "child_database")
    .map((b) => b.id);

  localLogger.info(
    {
      blocksWithChildrenCount: blocksWithChildren.length,
      childDatabasesCount: childDatabases.length,
    },
    "Found blocks with children and child databases."
  );

  localLogger.info(
    "notionBlockChildrenResultPageActivity: Saving blocks in cache."
  );
  await Promise.all(
    parsedBlocks.map((block, i) =>
      NotionConnectorBlockCacheEntry.upsert({
        notionPageId: pageId,
        notionBlockId: block.id,
        blockType: block.type,
        blockText: block.text,
        parentBlockId: blockId,
        indexInParent: currentIndexInParent + i,
        childDatabaseTitle: block.childDatabaseTitle,
        connectorId: connector.id,
      })
    )
  );

  return {
    childDatabases,
    blocksWithChildren,
    blocksCount: parsedBlocks.length,
    nextCursor: resultPage.next_cursor,
  };
}

export async function cacheDatabaseChildren({
  connectorId,
  databaseId,
  cursor,
  loggerArgs,
}: {
  connectorId: ModelId;
  databaseId: string;
  cursor: string | null;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  nextCursor: string | null;
  childrenCount: number;
}> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const accessToken = await getNotionAccessToken(connector.connectionId);

  const localLogger = logger.child({
    ...loggerArgs,
    databaseId,
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  });

  localLogger.info(
    "notionDatabaseChildrenResultPageActivity: Retrieving connector."
  );

  localLogger.info(
    "notionDatabaseChildrenResultPageActivity: Retrieving result page from Notion API."
  );
  const resultPage = await retrieveDatabaseChildrenResultPage({
    accessToken,
    databaseId,
    cursor,
    loggerArgs,
  });

  if (!resultPage) {
    localLogger.info("Skipping result page not found.");
    return {
      nextCursor: null,
      childrenCount: 0,
    };
  }

  let pages = [];
  for (const p of resultPage.results) {
    if (isFullPage(p)) {
      pages.push(p);
    }
  }

  // exclude pages that are already in the cache
  const existingPages = await NotionConnectorPageCacheEntry.findAll({
    where: {
      notionPageId: resultPage.results.map((r) => r.id),
      connectorId: connector.id,
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

  await Promise.all(
    pages.map((page) =>
      NotionConnectorPageCacheEntry.upsert({
        notionPageId: page.id,
        connectorId: connector.id,
        pageProperties: {},
        pagePropertiesText: ((p: PageObjectProperties) => JSON.stringify(p))(
          page.properties
        ),
        parentId: databaseId,
        parentType: "database",
        createdById: page.created_by.id,
        lastEditedById: page.last_edited_by.id,
        createdTime: page.created_time,
        lastEditedTime: page.last_edited_time,
        url: page.url,
      })
    )
  );

  return {
    childrenCount: pages.length,
    nextCursor: resultPage.next_cursor,
  };
}

async function resolveResourceParent({
  parentId,
  parentType,
  pageId,
  accessToken,
  loggerArgs,
}: {
  parentId: string;
  parentType: NotionConnectorPageCacheEntry["parentType"];
  pageId: string;
  accessToken: string;
  loggerArgs: Record<string, string | number>;
}): Promise<{
  parentId: string;
  parentType: NotionConnectorPageCacheEntry["parentType"];
}> {
  const localLogger = logger.child({
    ...loggerArgs,
    pageId,
  });

  if (parentType === "unknown" || parentType === "workspace") {
    return {
      parentId,
      parentType,
    };
  }

  if (parentType === "block") {
    return {
      parentId: "unknown",
      parentType: "unknown",
    };
  }

  let reachable = await isAccessibleAndUnarchived(
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

  localLogger.info(
    "Parent is not reachable -- attempting to find a better one."
  );

  // refetch the page in hopes of getting a valid parent
  const page = await retrievePage({
    accessToken,
    pageId,
    loggerArgs,
  });

  if (!page) {
    logger.info("Could not retrieve page to find a better parent.");
    return {
      parentId: "unknown",
      parentType: "unknown",
    };
  }

  const parent = getPageOrBlockParent(page);
  let newParentId = parent.id;
  let newParentType = parent.type;

  if (parent.type === "block") {
    localLogger.info(
      "Parent is a block, attempting to find a non-block parent."
    );
    const blockParent = await getBlockParentMemoized(
      accessToken,
      parent.id,
      localLogger
    );
    if (!blockParent) {
      localLogger.info("Could not retrieve block parent.");
      return {
        parentId: "unknown",
        parentType: "unknown",
      };
    }
    newParentId = blockParent.parentId;
    newParentType = blockParent.parentType;
  }

  if (newParentType === "block") {
    localLogger.warn("Could not find a valid non-block parent.");
    return {
      parentId: "unknown",
      parentType: "unknown",
    };
  }

  if (newParentType === "workspace" || newParentType === "unknown") {
    return {
      parentId: newParentId,
      parentType: newParentType,
    };
  }

  reachable = await isAccessibleAndUnarchived(
    accessToken,
    newParentId,
    newParentType,
    localLogger
  );

  if (reachable) {
    localLogger.info("Found a new reachable parent.");
    return {
      parentId: newParentId,
      parentType: newParentType,
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
}: {
  connectorId: ModelId;
  pageId: string;
  loggerArgs: Record<string, string | number>;
  runTimestamp: number;
  isFullSync: boolean;
}) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const accessToken = await getNotionAccessToken(connector.connectionId);

  const localLogger = logger.child({
    ...loggerArgs,
    pageId,
    dataSourceName: connector.dataSourceName,
    workspaceId: connector.workspaceId,
  });

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving page from cache."
  );
  const pageCacheEntry = await NotionConnectorPageCacheEntry.findOne({
    where: {
      notionPageId: pageId,
      connectorId: connector.id,
    },
  });
  if (!pageCacheEntry) {
    throw new Error("Could not find page in cache");
  }

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving blocks from cache."
  );
  const blockCacheEntries = await NotionConnectorBlockCacheEntry.findAll({
    where: {
      notionPageId: pageId,
      connectorId: connector.id,
    },
  });

  const blocksByParentId: Record<string, NotionConnectorBlockCacheEntry[]> = {};
  for (const blockCacheEntry of blockCacheEntries) {
    blocksByParentId[blockCacheEntry.parentBlockId || "root"] = [
      ...(blocksByParentId[blockCacheEntry.parentBlockId || "root"] ?? []),
      blockCacheEntry,
    ];
  }

  const childDatabaseTitleById = blockCacheEntries
    .filter((b) => b.blockType === "child_database")
    .map((b) => ({
      id: b.notionBlockId,
      title:
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        b.childDatabaseTitle!,
    }))
    .reduce((acc, { id, title }) => {
      acc[id] = title;
      return acc;
    }, {} as Record<string, string>);

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving child database pages from cache."
  );
  const childDbPagesCacheEntries = await NotionConnectorPageCacheEntry.findAll({
    where: {
      parentId: Object.keys(blocksByParentId),
      connectorId: connector.id,
    },
  });
  const childDatabases: Record<string, NotionConnectorPageCacheEntry[]> = {};
  for (const childDbPageCacheEntry of childDbPagesCacheEntries) {
    childDatabases[childDbPageCacheEntry.parentId] = [
      ...(childDatabases[childDbPageCacheEntry.parentId] ?? []),
      childDbPageCacheEntry,
    ];
  }
  const renderedChildDatabases: Record<string, string> = {};
  for (const [databaseId, pages] of Object.entries(childDatabases)) {
    renderedChildDatabases[databaseId] = renderChildDatabaseFromPages({
      databaseTitle: childDatabaseTitleById[databaseId] ?? null,
      pagesProperties: pages.map(
        (p) => JSON.parse(p.pagePropertiesText) as PageObjectProperties
      ),
    });
  }

  localLogger.info("notionRenderAndUpsertPageFromCache: Rendering page.");
  const renderedPageSection = renderPageSection({ blocksByParentId });
  const documentLength = sectionLength(renderedPageSection);

  // add a newline to separate the page from the metadata above (title, author...)
  renderedPageSection.content = "\n";

  // Adding notion properties to the page rendering
  // We skip the title as it is added separately as prefix to the top-level document section.
  const parsedProperties = parsePageProperties(
    JSON.parse(pageCacheEntry.pagePropertiesText) as PageObjectProperties
  );
  for (const p of parsedProperties.filter((p) => p.key !== "title" && p.text)) {
    const propertyContent = `$${p.key}: ${p.text}\n`;
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
        localLogger
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

  // checks if the parent is accessible. If not, attempts to refetch the page to hopefully get a
  // valid parent. If that fails, returns "unknown" parent (i.e, orphaned node).
  const resolvedParent = await resolveResourceParent({
    parentId,
    parentType,
    pageId,
    accessToken,
    loggerArgs: {
      ...loggerArgs,
      workspaceId: connector.workspaceId,
      dataSourceName: connector.dataSourceName,
    },
  });

  parentType = resolvedParent.parentType;
  parentId = resolvedParent.parentId;

  if (parentType === "page" || parentType === "database") {
    // check if we have the parent page/DB in the DB already. If not, we need to add it
    // to the cache of resources to check.
    localLogger.info(
      { parentType, parentId },
      "notionRenderAndUpsertPageFromCache: Retrieving parent page/DB from connectors DB."
    );

    let notionId: string | null = null;
    if (parentType === "page") {
      const existingParentPage = await NotionPage.findOne({
        where: {
          notionPageId: parentId,
          connectorId: connector.id,
        },
      });
      if (!existingParentPage) {
        localLogger.info(
          "notionRenderAndUpsertPageFromCache: Parent page not found in connectors DB."
        );
        notionId = parentId;
      }
    } else if (parentType === "database") {
      const existingParentDatabase = await NotionDatabase.findOne({
        where: {
          notionDatabaseId: parentId,
          connectorId: connector.id,
        },
      });
      if (!existingParentDatabase) {
        localLogger.info(
          "notionRenderAndUpsertPageFromCache: Parent database not found in connectors DB."
        );
        notionId = parentId;
      }
    } else {
      ((_x: never) => void _x)(parentType);
    }

    if (notionId) {
      await NotionConnectorResourcesToCheckCacheEntry.upsert({
        notionId,
        connectorId: connector.id,
        resourceType: parentType,
      });
    }
  }

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Retrieving Notion page from connectors DB."
  );
  const notionPageInDb = await getNotionPageFromConnectorsDb(
    connectorId,
    pageId
  );

  const createdOrMoved =
    parentType !== notionPageInDb?.parentType ||
    parentId !== notionPageInDb?.parentId;

  const titleProperty =
    parsedProperties.find((p) => p.type === "title") ??
    parsedProperties.find((p) => p.key === "title");

  const title = titleProperty?.text ?? undefined;

  let upsertTs: number | undefined = undefined;
  let skipReason: string | null = null;

  if (documentLength > MAX_DOCUMENT_TXT_LEN) {
    localLogger.info(
      {
        renderedPageLength: documentLength,
        maxDocumentTxtLength: MAX_DOCUMENT_TXT_LEN,
      },
      "notionRenderAndUpsertPageFromCache: Skipping page with too large body."
    );
    skipReason = "body_too_large";
  }

  const createdAt = new Date(pageCacheEntry.createdTime);
  const updatedAt = new Date(pageCacheEntry.lastEditedTime);

  if (documentLength === 0) {
    localLogger.info(
      "notionRenderAndUpsertPageFromCache: Not upserting page without body."
    );
  } else if (!skipReason) {
    upsertTs = new Date().getTime();
    const documentId = `notion-${pageId}`;
    localLogger.info(
      "notionRenderAndUpsertPageFromCache: Fetching resource parents."
    );
    const parents = await getParents(
      connectorId,
      pageId,
      runTimestamp.toString()
    );

    const contentFlat = sectionFullText(renderedPageSection);

    const content = renderDocumentTitleAndContent({
      title: title ?? null,
      createdAt: createdAt,
      updatedAt: updatedAt,
      author,
      lastEditor,
      content: {
        prefix: null,
        content: contentFlat,
        sections: [],
      },
    });

    localLogger.info(
      "notionRenderAndUpsertPageFromCache: Upserting to Data Source."
    );
    await upsertToDatasource({
      dataSourceConfig: {
        dataSourceName: connector.dataSourceName,
        workspaceId: connector.workspaceId,
        workspaceAPIKey: connector.workspaceAPIKey,
      },
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
      }),
      parents,
      retries: 3,
      delayBetweenRetriesMs: 5000,
      loggerArgs,
      upsertContext: {
        sync_type: isFullSync ? "batch" : "incremental",
      },
    });
  }

  localLogger.info(
    "notionRenderAndUpsertPageFromCache: Saving page in connectors DB."
  );
  await upsertNotionPageInConnectorsDb({
    dataSourceInfo: {
      dataSourceName: connector.dataSourceName,
      workspaceId: connector.workspaceId,
    },
    notionPageId: pageId,
    lastSeenTs: runTimestamp,
    parentType,
    parentId,
    title,
    notionUrl: pageCacheEntry.url,
    lastUpsertedTs: upsertTs,
    skipReason: skipReason ?? undefined,
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
      })
    ),
    ...pageEntriesToCreate.map((id) =>
      NotionConnectorResourcesToCheckCacheEntry.upsert({
        notionId: id,
        resourceType: "page",
        connectorId: connector.id,
      })
    ),
  ]);
}

export async function clearConnectorCache(connectorId: ModelId) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  });

  localLogger.info("notionClearConnectorCacheActivity: Clearing cache.");
  await NotionConnectorPageCacheEntry.destroy({
    where: {
      connectorId: connector.id,
    },
  });
  await NotionConnectorBlockCacheEntry.destroy({
    where: {
      connectorId: connector.id,
    },
  });
  await NotionConnectorResourcesToCheckCacheEntry.destroy({
    where: {
      connectorId: connector.id,
    },
  });
}

export async function getDiscoveredResourcesFromCache(
  connectorId: ModelId
): Promise<{ pageIds: string[]; databaseIds: string[] }> {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      id: connectorId,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const localLogger = logger.child({
    workspaceId: connector.workspaceId,
    dataSourceName: connector.dataSourceName,
  });

  localLogger.info(
    "notionGetResourcesToCheckFromCacheActivity: Retrieving resources to check from cache."
  );

  const resourcesToCheck =
    await NotionConnectorResourcesToCheckCacheEntry.findAll({
      where: {
        connectorId: connector.id,
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

  if (discoveredPageIds.length || discoveredDatabaseIds.length) {
    localLogger.info(
      {
        discoveredPageIdsCount: discoveredPageIds.length,
        discoveredDatabaseIdsCount: discoveredDatabaseIds.length,
      },
      "Discovered new resources."
    );
  }

  return {
    pageIds: discoveredPageIds,
    databaseIds: discoveredDatabaseIds,
  };
}

/** Render page sections according to Notion structure:
 * - the natural nesting of blocks is used as structure,
 * - H1 & H2 blocks add a level of nesting in addition to the "natural" nesting,
 * - only the 2 first levels of nesting are used to create prefixes, similarly
 *   to github, to avoid too many prefixes
 */
function renderPageSection({
  blocksByParentId,
}: {
  blocksByParentId: Record<string, NotionConnectorBlockCacheEntry[]>;
}): CoreAPIDataSourceDocumentSection {
  const renderedPageSection: CoreAPIDataSourceDocumentSection = {
    prefix: null,
    content: null,
    sections: [],
  };

  // Change block parents so that H1/H2 blocks are treated as nesting
  // for that we need to traverse with a topological sort, leafs treated first
  const orderedParentIds: string[] = [];
  const addNode = (nodeId: string) => {
    const children = blocksByParentId[nodeId];
    if (!children) return;
    orderedParentIds.push(nodeId);
    for (const child of children) {
      addNode(child.notionBlockId);
    }
  };
  addNode("root");
  orderedParentIds.reverse();

  const adaptedBlocksByParentId: Record<
    string,
    NotionConnectorBlockCacheEntry[]
  > = {};

  for (const parentId of orderedParentIds) {
    const blocks = blocksByParentId[
      parentId
    ] as NotionConnectorBlockCacheEntry[];
    blocks.sort((a, b) => a.indexInParent - b.indexInParent);
    const currentHeadings: { h1: string | null; h2: string | null } = {
      h1: null,
      h2: null,
    };
    for (const block of blocks) {
      if (block.blockType === "heading_1") {
        adaptedBlocksByParentId[parentId] = [
          ...(adaptedBlocksByParentId[parentId] ?? []),
          block,
        ];
        currentHeadings.h1 = block.notionBlockId;
        currentHeadings.h2 = null;
      } else if (block.blockType === "heading_2") {
        const h2ParentId = currentHeadings.h1 ?? parentId;
        adaptedBlocksByParentId[h2ParentId] = [
          ...(adaptedBlocksByParentId[h2ParentId] ?? []),
          block,
        ];
        currentHeadings.h2 = block.notionBlockId;
      } else {
        const currentParentId =
          currentHeadings.h2 ?? currentHeadings.h1 ?? parentId;
        adaptedBlocksByParentId[currentParentId] = [
          ...(adaptedBlocksByParentId[currentParentId] ?? []),
          block,
        ];
      }
    }
  }

  const renderBlockSection = (
    b: NotionConnectorBlockCacheEntry,
    depth: number,
    indent = ""
  ): CoreAPIDataSourceDocumentSection => {
    // Initial rendering (remove base64 images from rendered block)
    let renderedBlock = b.blockText ? `${indent}${b.blockText}` : "";
    renderedBlock = renderedBlock
      .trim()
      .replace(/data:image\/[^;]+;base64,[^\n]+/g, "")
      .concat("\n");
    if (b.blockType === "heading_1" || b.blockType === "heading_2") {
      renderedBlock = "\n" + renderedBlock;
    }

    // Prefix for depths 0 and 1, and only if children
    const blockSection =
      depth < 1 && adaptedBlocksByParentId[b.notionBlockId]?.length
        ? renderPrefixSection(renderedBlock)
        : {
            prefix: null,
            content: renderedBlock,
            sections: [],
          };

    // Recurse on children
    const children = adaptedBlocksByParentId[b.notionBlockId] ?? [];
    children.sort((a, b) => a.indexInParent - b.indexInParent);
    if (b.blockType !== "heading_1" && b.blockType !== "heading_2") {
      indent = `- ${indent}`;
    }
    for (const child of children) {
      blockSection.sections.push(renderBlockSection(child, depth + 1, indent));
    }
    return blockSection;
  };

  const topLevelBlocks = adaptedBlocksByParentId["root"] || [];
  topLevelBlocks.sort((a, b) => a.indexInParent - b.indexInParent);
  for (const block of topLevelBlocks) {
    renderedPageSection.sections.push(renderBlockSection(block, 0));
  }
  return renderedPageSection;
}
