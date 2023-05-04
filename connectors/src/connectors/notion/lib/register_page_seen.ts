import { Connector, NotionPage, sequelize_conn } from "@connectors/lib/models";
import { DataSourceInfo } from "@connectors/types/data_source_config";

export async function registerPageSeen(
  dataSourceInfo: DataSourceInfo,
  notionPageId: string,
  ts: number
): Promise<boolean> {
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
      if (existingPage.lastSeenTs?.getTime() === ts) {
        await transaction.rollback();
        return false;
      }

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
    return true;
  } catch (e) {
    await transaction.rollback();
    throw e;
  }
}
