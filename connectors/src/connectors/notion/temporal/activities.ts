import { Context } from "@temporalio/activity";
import { Op } from "sequelize";

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
  getDatabaseChildPages,
  getPagesAndDatabasesEditedSince,
  getParsedDatabase,
  getParsedPage,
  isAccessibleAndUnarchived,
} from "@connectors/connectors/notion/lib/notion_api";
import {
  getParents,
  updateAllParentsFields,
} from "@connectors/connectors/notion/lib/parents";
import { getTagsForPage } from "@connectors/connectors/notion/lib/tags";
import {
  deleteFromDataSource,
  MAX_DOCUMENT_TXT_LEN,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import {
  Connector,
  NotionConnectorState,
  NotionDatabase,
  NotionPage,
} from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

const logger = mainLogger.child({ provider: "notion" });

const GARBAGE_COLLECTION_INTERVAL_HOURS = 12;

export async function getDatabaseChildPagesActivity({
  databaseId,
  dataSourceInfo,
  accessToken,
  cursor,
  loggerArgs,
  excludeUpToDatePages,
}: {
  databaseId: string;
  dataSourceInfo: DataSourceInfo;
  accessToken: string;
  cursor: string | null;
  loggerArgs: Record<string, string | number>;
  excludeUpToDatePages: boolean;
}): Promise<{
  pageIds: string[];
  nextCursor: string | null;
}> {
  const localLoggerArgs = {
    ...loggerArgs,
    databaseId,
    dataSourceName: dataSourceInfo.dataSourceName,
    workspaceId: dataSourceInfo.workspaceId,
  };
  const localLogger = logger.child(localLoggerArgs);

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceInfo.workspaceId,
      dataSourceName: dataSourceInfo.dataSourceName,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

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

  if (!excludeUpToDatePages) {
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

  localLogger.info(
    {
      initial_count: filteredPageIds.length,
      filtered_count: filteredPageIds.length - filteredPageIds.length,
    },
    "Filtered out databases already up to date."
  );

  return {
    pageIds: filteredPageIds,
    nextCursor,
  };
}

export async function notionGetToSyncActivity(
  dataSourceInfo: DataSourceInfo,
  accessToken: string,
  lastSyncedAt: number | null,
  cursor: string | null,
  excludeUpToDatePages: boolean,
  loggerArgs: Record<string, string | number>
): Promise<{
  pageIds: string[];
  databaseIds: string[];
  nextCursor: string | null;
}> {
  const localLogger = logger.child({
    ...loggerArgs,
    dataSourceName: dataSourceInfo.dataSourceName,
    workspaceId: dataSourceInfo.workspaceId,
  });

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceInfo.workspaceId,
      dataSourceName: dataSourceInfo.dataSourceName,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

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
        dataSourceName: dataSourceInfo.dataSourceName,
        workspaceId: dataSourceInfo.workspaceId,
      },
      skippedDatabaseIds
    );
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
          "Failed to get Notion search result page with cursor. Giving up and moving on"
        );
        return {
          pageIds: [],
          databaseIds: [],
          nextCursor: null,
        };
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

export async function notionUpsertPageActivity(
  accessToken: string,
  pageId: string,
  dataSourceConfig: DataSourceConfig,
  runTimestamp: number,
  loggerArgs: Record<string, string | number>,
  isFullSync: boolean
): Promise<void> {
  const localLogger = logger.child({ ...loggerArgs, pageId });

  const notionPage = await getNotionPageFromConnectorsDb(
    dataSourceConfig,
    pageId
  );

  const alreadySeenInRun = notionPage?.lastSeenTs?.getTime() === runTimestamp;

  if (alreadySeenInRun) {
    localLogger.info("Skipping page already seen in this run");
    return;
  }

  const isSkipped = !!notionPage?.skipReason;

  if (isSkipped) {
    localLogger.info(
      { skipReason: notionPage.skipReason },
      "Skipping page with skip reason"
    );
    return;
  }

  let upsertTs: number | undefined = undefined;

  const parsedPage = await getParsedPage(accessToken, pageId, loggerArgs);

  const createdOrMoved =
    parsedPage?.parentType !== notionPage?.parentType ||
    parsedPage?.parentId !== notionPage?.parentId;

  if (parsedPage && parsedPage.rendered.length > MAX_DOCUMENT_TXT_LEN) {
    localLogger.info("Skipping page with too large body");
    await upsertNotionPageInConnectorsDb({
      dataSourceInfo: dataSourceConfig,
      notionPageId: pageId,
      lastSeenTs: runTimestamp,
      parentType: parsedPage.parentType,
      parentId: parsedPage.parentId,
      title: parsedPage ? parsedPage.title : null,
      notionUrl: parsedPage ? parsedPage.url : null,
      lastUpsertedTs: upsertTs,
      skipReason: "body_too_large",
      lastCreatedOrMovedRunTs: createdOrMoved ? runTimestamp : undefined,
    });
    return;
  }

  if (parsedPage && parsedPage.hasBody) {
    upsertTs = new Date().getTime();
    const documentId = `notion-${parsedPage.id}`;
    const parents = await getParents(
      dataSourceConfig,
      pageId,
      runTimestamp.toString() // memoize at notionSyncWorkflow main inner loop level
    );
    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentText: parsedPage.rendered,
      documentUrl: parsedPage.url,
      timestampMs: parsedPage.updatedTime,
      tags: getTagsForPage(parsedPage),
      parents,
      retries: 3,
      delayBetweenRetriesMs: 500,
      loggerArgs,
      upsertContext: {
        sync_type: isFullSync ? "batch" : "incremental",
      },
    });
  } else {
    localLogger.info("Skipping page without body");
  }

  localLogger.info("notionUpsertPageActivity: Upserting notion page in DB.");
  await upsertNotionPageInConnectorsDb({
    dataSourceInfo: dataSourceConfig,
    notionPageId: pageId,
    lastSeenTs: runTimestamp,
    parentType: parsedPage ? parsedPage.parentType : null,
    parentId: parsedPage ? parsedPage.parentId : null,
    title: parsedPage ? parsedPage.title : null,
    notionUrl: parsedPage ? parsedPage.url : null,
    lastUpsertedTs: upsertTs,
    lastCreatedOrMovedRunTs: createdOrMoved ? runTimestamp : undefined,
  });
  return;
}

export async function notionUpsertDatabaseActivity(
  accessToken: string,
  databaseId: string,
  dataSourceConfig: DataSourceConfig,
  runTimestamp: number,
  loggerArgs: Record<string, string | number>
): Promise<void> {
  const localLogger = logger.child({ ...loggerArgs, databaseId });

  const notionDatabase = await getNotionDatabaseFromConnectorsDb(
    dataSourceConfig,
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
    dataSourceInfo: dataSourceConfig,
    notionDatabaseId: databaseId,
    lastSeenTs: runTimestamp,
    parentType: parsedDb ? parsedDb.parentType : null,
    parentId: parsedDb ? parsedDb.parentId : null,
    title: parsedDb ? parsedDb.title : null,
    notionUrl: parsedDb ? parsedDb.url : null,
    lastCreatedOrMovedRunTs: createdOrMoved ? runTimestamp : undefined,
  });
}

export async function saveSuccessSyncActivity(
  dataSourceConfig: DataSourceConfig
) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
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

export async function saveStartSyncActivity(
  dataSourceConfig: DataSourceConfig
) {
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
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

export async function getInitialWorkflowParamsActivity(
  dataSourceConfig: DataSourceConfig
): Promise<{
  notionAccessToken: string;
  shouldGargageCollect: boolean;
}> {
  return {
    notionAccessToken: await getNotionAccessToken(dataSourceConfig),
    shouldGargageCollect: await shouldGarbageCollect(dataSourceConfig),
  };
}

export async function getNotionAccessToken(
  dataSourceConfig: DataSourceConfig
): Promise<string> {
  const { NANGO_NOTION_CONNECTOR_ID } = process.env;

  if (!NANGO_NOTION_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const nangoConnectionId = connector.connectionId;

  const notionAccessToken = (await nango_client().getToken(
    NANGO_NOTION_CONNECTOR_ID,
    nangoConnectionId
  )) as string;

  return notionAccessToken;
}

async function shouldGarbageCollect(
  dataSourceConfig: DataSourceConfig
): Promise<boolean> {
  if (!isDuringGarbageCollectStartWindow()) {
    // Never garbage collect if we are not in the start window
    return false;
  }

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
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

export async function syncGarbageCollectorActivity(
  dataSourceInfo: DataSourceInfo,
  pageIds: string[],
  databaseIds: string[],
  runTimestamp: number
): Promise<{ newPageIds: string[]; newDatabaseIds: string[] }> {
  const localLogger = logger.child({
    dataSourceName: dataSourceInfo.dataSourceName,
    workspaceId: dataSourceInfo.workspaceId,
  });

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceInfo.workspaceId,
      dataSourceName: dataSourceInfo.dataSourceName,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

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
export async function garbageCollectActivity(
  dataSourceConfig: DataSourceConfig,
  runTimestamp: number,
  startTs: number
) {
  const localLogger = logger.child({
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
  });

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
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
  const notionAccessToken = await getNotionAccessToken(dataSourceConfig);

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
    await deleteFromDataSource(dataSourceConfig, `notion-${page.notionPageId}`);
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

export async function updateParentsFieldsActivity(
  dataSourceConfig: DataSourceConfig,
  runTimestamp: number,
  activityExecutionTimestamp: number
) {
  const localLogger = logger.child({
    workspaceId: dataSourceConfig.workspaceId,
    dataSourceName: dataSourceConfig.dataSourceName,
  });

  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
  });
  if (!connector) {
    throw new Error("Could not find connector");
  }

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

  const nbUpdated = await updateAllParentsFields(
    dataSourceConfig,
    notionPageIds,
    notionDatabaseIds,
    activityExecutionTimestamp.toString()
  );

  localLogger.info({ nbUpdated }, "Updated parents fields.");
}
