import {
  getPagesEditedSince,
  getParsedPage,
} from "@connectors/connectors/notion/lib/notion_api";
import { getTagsForPage } from "@connectors/connectors/notion/lib/tags";
import { Connector, NotionPage, sequelize_conn } from "@connectors/lib/models";
import { nango_client } from "@connectors/lib/nango_client";
import { upsertToDatasource } from "@connectors/lib/upsert";
import mainLogger from "@connectors/logger/logger";
import {
  DataSourceConfig,
  DataSourceInfo,
} from "@connectors/types/data_source_config";

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
  dataSourceConfig: DataSourceConfig
) {
  const parsedPage = await getParsedPage(accessToken, pageId);
  if (!parsedPage || !parsedPage.hasBody) {
    logger.info(
      {
        pageId,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      "Skipping page without body"
    );
    return;
  }
  const documentId = `notion-${parsedPage.id}`;
  await upsertToDatasource(
    dataSourceConfig,
    documentId,
    parsedPage.rendered,
    parsedPage.url,
    parsedPage.createdTime,
    getTagsForPage(parsedPage)
  );

  const notionPage = await NotionPage.findOne({
    where: {
      notionPageId: pageId,
    },
  });

  if (!notionPage) {
    logger.warn(
      {
        pageId,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceName: dataSourceConfig.dataSourceName,
      },
      "notionUpsertPageActivity: Could not find notion page in DB."
    );
    return;
  }

  logger.info(
    {
      pageId,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
    "notionUpsertPageActivity: Updating notion page in DB."
  );
  await notionPage.update({
    lastUpsertedTs: new Date(),
    dustDatasourceDocumentId: documentId,
  });
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

export async function registerPageSeenActivity(
  dataSourceInfo: DataSourceInfo,
  notionPageId: string,
  ts: number
) {
  const transaction = await sequelize_conn.transaction();
  const connector = await Connector.findOne({
    where: {
      type: "notion",
      workspaceId: dataSourceInfo.workspaceId,
      dataSourceName: dataSourceInfo.dataSourceName,
    },
    transaction,
  });

  if (!connector) {
    await transaction.rollback();
    throw new Error("Could not find connector");
  }

  try {
    const existingPage = await NotionPage.findOne({
      where: {
        notionPageId,
        connectorId: connector?.id,
      },
      transaction,
    });

    if (existingPage) {
      await existingPage.update(
        {
          lastSeenTs: new Date(ts),
        },
        { transaction }
      );
    } else {
      await NotionPage.create(
        {
          notionPageId,
          connectorId: connector?.id,
          lastSeenTs: new Date(ts),
        },
        { transaction }
      );
    }

    await transaction.commit();
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}
