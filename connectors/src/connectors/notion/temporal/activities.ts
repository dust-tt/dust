import { Op } from "sequelize";

import {
  getNotionPageFromConnectorsDb,
  upsertNotionPageInConnectorsDb,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import {
  getPagesEditedSince,
  getParsedPage,
} from "@connectors/connectors/notion/lib/notion_api";
import { getTagsForPage } from "@connectors/connectors/notion/lib/tags";
import {
  deleteFromDataSource,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { Connector, NotionPage, sequelize_conn } from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
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

  const { pages, nextCursor } = await getPagesEditedSince(
    accessToken,
    lastSyncedAt,
    cursor,
    {
      ...loggerArgs,
      dataSourceName: dataSourceInfo.dataSourceName,
      workspaceId: dataSourceInfo.workspaceId,
    }
  );

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

  const alreadySeenInRun = !!(await getNotionPageFromConnectorsDb(
    dataSourceConfig,
    pageId,
    runTimestamp
  ));

  if (alreadySeenInRun) {
    localLogger.info("Skipping page already seen in this run");
    return;
  }

  let upsertTs: number | undefined = undefined;

  const parsedPage = await getParsedPage(accessToken, pageId, loggerArgs);
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
  const transaction = await sequelize_conn.transaction();

  try {
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

    const now = new Date();

    const firstSuccessfulSyncTime = connector.firstSuccessfulSyncTime || now;

    await connector.update({
      lastSyncStatus: "succeeded",
      lastSyncFinishTime: now,
      lastSyncSuccessfulTime: now,
      firstSuccessfulSyncTime,
    });

    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}

export async function saveStartSyncActivity(
  dataSourceConfig: DataSourceConfig
) {
  const transaction = await sequelize_conn.transaction();

  try {
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

    await connector.update({
      lastSyncStartTime: new Date(),
    });

    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
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

  // If we have never finished a full sync, we should not garbage collect
  const firstSuccessfulSyncTime = connector.firstSuccessfulSyncTime;
  if (!firstSuccessfulSyncTime) {
    return false;
  }

  const now = new Date().getTime();

  // If we have never done a garbage collection, we should start one
  // if it has been more than GARBAGE_COLLECTION_INTERVAL_HOURS since the first successful sync
  if (!connector.lastGarbageCollectionStartTime) {
    return (
      now - firstSuccessfulSyncTime.getTime() >=
      GARBAGE_COLLECTION_INTERVAL_HOURS * 60 * 60 * 1000
    );
  }

  const lastGarbageCollectionStartTime =
    connector.lastGarbageCollectionStartTime.getTime();

  // If we have started a garbage collection, we should not start another one
  if (!connector.lastGarbageCollectionFinishTime) {
    return false;
  }
  const lastGarbageCollectionFinishTime =
    connector.lastGarbageCollectionFinishTime.getTime();
  if (lastGarbageCollectionStartTime > lastGarbageCollectionFinishTime) {
    return false;
  }

  // if we garbage collected less than GARBAGE_COLLECTION_INTERVAL_HOURS ago, we should not start another one
  if (
    now - lastGarbageCollectionFinishTime <=
    GARBAGE_COLLECTION_INTERVAL_HOURS * 60 * 60 * 1000
  ) {
    return false;
  }

  return true;
}

export async function saveStartGarbageCollectionActivity(
  dataSourceConfig: DataSourceConfig
) {
  const transaction = await sequelize_conn.transaction();

  try {
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

    await connector.update({
      lastGarbageCollectionStartTime: new Date(),
    });

    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
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
        where: { notionPageId: pageIds, connectorId: connector.id },
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

export async function deletePagesNotVisitedInRunActivity(
  dataSourceConfig: DataSourceConfig,
  runTimestamp: number
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
  const pagesToDelete = await NotionPage.findAll({
    where: {
      connectorId: connector.id,
      lastSeenTs: {
        [Op.lt]: new Date(runTimestamp),
      },
    },
  });
  localLogger.info(
    { pagesToDeleteCount: pagesToDelete.length },
    "Found pages to delete."
  );
  for (const page of pagesToDelete) {
    localLogger.info({ pageId: page.notionPageId }, "Deleting page.");
    await deleteFromDataSource(dataSourceConfig, `notion-${page.notionPageId}`);
    await page.destroy();
  }
}

export async function saveSuccessGarbageCollectionActivity(
  dataSourceInfo: DataSourceInfo
) {
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
  await connector.update({
    lastGarbageCollectionFinishTime: new Date(),
  });
}
