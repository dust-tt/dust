import { Connector, NotionPage } from "@connectors/lib/models";
import { DataSourceInfo } from "@connectors/types/data_source_config";

export async function upsertNotionPageInConnectorsDb(
  dataSourceInfo: DataSourceInfo,
  notionPageId: string,
  lastSeenTs: number,
  lastUpsertedTs?: number,
  skipReason?: string
): Promise<NotionPage> {
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
  const page = await NotionPage.findOne({
    where: {
      notionPageId,
      connectorId: connector.id,
    },
  });

  const updateParams: {
    lastSeenTs: Date;
    lastUpsertedTs?: Date;
    skipReason?: string;
  } = {
    lastSeenTs: new Date(lastSeenTs),
  };
  if (lastUpsertedTs) {
    updateParams.lastUpsertedTs = new Date(lastUpsertedTs);
  }
  if (skipReason) {
    updateParams.skipReason = skipReason;
  }

  if (page) {
    return page.update(updateParams);
  } else {
    return NotionPage.create({
      notionPageId,
      connectorId: connector.id,
      ...updateParams,
    });
  }
}

export async function getNotionPageFromConnectorsDb(
  dataSourceInfo: DataSourceInfo,
  notionPageId: string,
  lastSeenTs?: number
): Promise<NotionPage | null> {
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

  const where: {
    notionPageId: string;
    connectorId: string;
    lastSeenTs?: Date;
  } = {
    notionPageId,
    connectorId: connector.id.toString(),
  };

  if (lastSeenTs) {
    where.lastSeenTs = new Date(lastSeenTs);
  }

  return NotionPage.findOne({ where });
}
