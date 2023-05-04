import {
  getNotionPageFromConnectorsDb,
  upsertNotionPageInConnectorsDb,
} from "@connectors/connectors/notion/lib/connectors_db_helpers";
import {
  getPagesEditedSince,
  getParsedPage,
} from "@connectors/connectors/notion/lib/notion_api";
import { getTagsForPage } from "@connectors/connectors/notion/lib/tags";
import { Connector, sequelize_conn } from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
import { upsertToDatasource } from "@connectors/lib/upsert";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({ provider: "notion" });

export async function notionGetPagesToSyncActivity(
  accessToken: string,
  lastSyncedAt: number | null,
  cursor: string | null,
  loggerArgs: Record<string, string | number>
): Promise<{ pageIds: string[]; nextCursor: string | null }> {
  return getPagesEditedSince(accessToken, lastSyncedAt, cursor, loggerArgs);
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

    await connector.update({
      lastSyncStatus: "succeeded",
      lastSyncFinishTime: now,
      lastSyncSuccessfulTime: now,
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

export async function getNotionAccessTokenActivity(
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
