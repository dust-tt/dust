import { Context } from "@temporalio/activity";
import { Op } from "sequelize";

import {
  getNotionPageFromConnectorsDb,
  upsertNotionPageInConnectorsDb,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import {
  GARBAGE_COLLECT_MAX_DURATION_MS,
  isDuringGarbageCollectStartWindow,
} from "@connectors/connectors/notion/lib/garbage_collect";
import {
  getPagesEditedSince,
  getParsedPage,
  isPageAccessibleAndUnarchived,
} from "@connectors/connectors/notion/lib/notion_api";
import { getTagsForPage } from "@connectors/connectors/notion/lib/tags";
import {
  deleteFromDataSource,
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

const GARBAGE_COLLECTION_INTERVAL_HOURS = 24;

export async function notionGetPagesToSyncActivity(
  dataSourceInfo: DataSourceInfo,
  accessToken: string,
  lastSyncedAt: number | null,
  cursor: string | null,
  excludeUpToDatePages: boolean,
  loggerArgs: Record<string, string | number>
): Promise<{ pageIds: string[]; nextCursor: string | null }> {
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
    res = await getPagesEditedSince(
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

  const existingPages = await NotionPage.findAll({
    where: {
      notionPageId: pages.map((p) => p.id),
      connectorId: connector.id,
    },
    attributes: ["notionPageId", "lastSeenTs"],
  });
  localLogger.info({ count: existingPages.length }, "Found existing pages");
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
      count: existingPages.length - filteredPageIds.length,
    },
    "Filtered out pages already up to date."
  );

  return {
    pageIds: filteredPageIds,
    nextCursor,
  };
}

export async function notionUpsertPageActivity(
  accessToken: string,
  pageId: string,
  dataSourceConfig: DataSourceConfig,
  runTimestamp: number,
  loggerArgs: Record<string, string | number>
) {
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

  if (parsedPage && parsedPage.rendered.length > 1000000) {
    localLogger.info("Skipping page with too large body");
    await upsertNotionPageInConnectorsDb(
      dataSourceConfig,
      pageId,
      runTimestamp,
      upsertTs,
      "body_too_large"
    );
    return;
  }

  if (parsedPage && parsedPage.hasBody) {
    upsertTs = new Date().getTime();
    const documentId = `notion-${parsedPage.id}`;
    await upsertToDatasource(
      dataSourceConfig,
      documentId,
      parsedPage.rendered,
      parsedPage.url,
      parsedPage.createdTime,
      getTagsForPage(parsedPage),
      3,
      500,
      loggerArgs
    );
  } else {
    localLogger.info("Skipping page without body");
  }

  localLogger.info("notionUpsertPageActivity: Upserting notion page in DB.");
  await upsertNotionPageInConnectorsDb(
    dataSourceConfig,
    pageId,
    runTimestamp,
    upsertTs
  );
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
  dataSourceConfig: DataSourceConfig,
  nangoConnectionId: string
): Promise<{
  notionAccessToken: string;
  shouldGargageCollect: boolean;
}> {
  return {
    notionAccessToken: await getNotionAccessToken(nangoConnectionId),
    shouldGargageCollect: await shouldGarbageCollect(dataSourceConfig),
  };
}

async function getNotionAccessToken(
  nangoConnectionId: string
): Promise<string> {
  const { NANGO_NOTION_CONNECTOR_ID } = process.env;

  if (!NANGO_NOTION_CONNECTOR_ID) {
    throw new Error("NANGO_NOTION_CONNECTOR_ID not set");
  }

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

export async function syncGarbageCollectorPagesActivity(
  dataSourceInfo: DataSourceInfo,
  pageIds: string[],
  runTimestamp: number
): Promise<string[]> {
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

  return newPageIds;
}

// - look at pages that have a lastSeenTs < runTimestamp
// - for each page, query notion API and check if the page still exists
// - if the page does not exist, delete it from the database
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
  const pagesToDelete = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
      // only look at pages that have not been seen since the last garbage collection
      lastSeenTs: {
        [Op.lt]: new Date(runTimestamp),
      },
    },
    // first handle pages that we have seen the longest time ago
    order: [["lastSeenTs", "ASC"]],
  });
  localLogger.info(
    { pagesToDeleteCount: pagesToDelete.length },
    "Found pages to delete."
  );

  const notionAccessToken = await getNotionAccessToken(connector.connectionId);

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
      pageIsAccessible = await isPageAccessibleAndUnarchived(
        notionAccessToken,
        page.notionPageId,
        iterationLogger
      );
    } catch (e) {
      // Sometimes a request will consistently fail with a 500
      // We don't want to delete the page in that case, so we just
      //  log the error and move on
      const potentialNotionError = e as {
        body: unknown;
        code: string;
        status: number;
      };
      if (
        ([
          "internal_server_error",
          "notionhq_client_request_timeout",
          "service_unavailable",
          "notionhq_client_response_error",
        ].includes(potentialNotionError.code) ||
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
      // mark the page as seen
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
  await notionConnectorState.update({
    lastGarbageCollectionFinishTime: new Date(),
  });
}
