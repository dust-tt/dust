import { Connector, NotionDatabase, NotionPage } from "@connectors/lib/models";
import { DataSourceInfo } from "@connectors/types/data_source_config";

// Note: this function does not let you "remove" a skipReason.
export async function upsertNotionPageInConnectorsDb({
  dataSourceInfo,
  notionPageId,
  lastSeenTs,
  parentType,
  parentId,
  title,
  notionUrl,
  lastUpsertedTs,
  skipReason,
  lastCreatedOrMovedRunTs,
}: {
  dataSourceInfo: DataSourceInfo;
  notionPageId: string;
  lastSeenTs: number;
  parentType?: string | null;
  parentId?: string | null;
  title?: string | null;
  notionUrl?: string | null;
  lastUpsertedTs?: number;
  skipReason?: string;
  lastCreatedOrMovedRunTs?: number;
}): Promise<NotionPage> {
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
    parentType?: string;
    parentId?: string;
    title?: string;
    notionUrl?: string;
    lastUpsertedTs?: Date;
    skipReason?: string;
    lastCreatedOrMovedRunTs?: number;
  } = {
    lastSeenTs: new Date(lastSeenTs),
  };
  if (lastUpsertedTs) {
    updateParams.lastUpsertedTs = new Date(lastUpsertedTs);
  }
  if (skipReason) {
    updateParams.skipReason = skipReason;
  }
  if (parentType) {
    updateParams.parentType = parentType;
  }
  if (parentId) {
    updateParams.parentId = parentId;
  }
  if (title) {
    updateParams.title = title;
  }
  if (notionUrl) {
    updateParams.notionUrl = notionUrl;
  }
  if (lastCreatedOrMovedRunTs) {
    updateParams.lastCreatedOrMovedRunTs = lastCreatedOrMovedRunTs;
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

// Note: this function does not let you "remove" a skipReason.
export async function upsertNotionDatabaseInConnectorsDb({
  dataSourceInfo,
  notionDatabaseId,
  lastSeenTs,
  parentType,
  parentId,
  title,
  notionUrl,
  skipReason,
  lastCreatedOrMovedRunTs,
}: {
  dataSourceInfo: DataSourceInfo;
  notionDatabaseId: string;
  lastSeenTs: number;
  parentType?: string | null;
  parentId?: string | null;
  title?: string | null;
  notionUrl?: string | null;
  skipReason?: string;
  lastCreatedOrMovedRunTs?: number;
}): Promise<NotionDatabase> {
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
  const database = await NotionDatabase.findOne({
    where: {
      notionDatabaseId,
      connectorId: connector.id,
    },
  });

  const updateParams: {
    lastSeenTs: Date;
    parentType?: string;
    parentId?: string;
    title?: string;
    notionUrl?: string;
    skipReason?: string;
    lastCreatedOrMovedRunTs?: number;
  } = {
    lastSeenTs: new Date(lastSeenTs),
  };
  if (skipReason) {
    updateParams.skipReason = skipReason;
  }
  if (parentType) {
    updateParams.parentType = parentType;
  }
  if (parentId) {
    updateParams.parentId = parentId;
  }
  if (title) {
    updateParams.title = title;
  }
  if (notionUrl) {
    updateParams.notionUrl = notionUrl;
  }
  if (lastCreatedOrMovedRunTs) {
    updateParams.lastCreatedOrMovedRunTs = lastCreatedOrMovedRunTs;
  }

  if (database) {
    return database.update(updateParams);
  } else {
    return NotionDatabase.create({
      notionDatabaseId,
      connectorId: connector.id,
      ...updateParams,
    });
  }
}

export async function getNotionDatabaseFromConnectorsDb(
  dataSourceInfo: DataSourceInfo,
  notionDatabaseId: string,
  lastSeenTs?: number
): Promise<NotionDatabase | null> {
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
    notionDatabaseId: string;
    connectorId: string;
    lastSeenTs?: Date;
  } = {
    notionDatabaseId,
    connectorId: connector.id.toString(),
  };

  if (lastSeenTs) {
    where.lastSeenTs = new Date(lastSeenTs);
  }

  return NotionDatabase.findOne({ where });
}

/**
 * Get children *that are pages* of a given notion page or database
 *
 * !! Not children *of a page*
 */
export async function getPageChildrenOf(
  dataSourceInfo: DataSourceInfo,
  notionId: string
): Promise<NotionPage[]> {
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

  return NotionPage.findAll({
    where: {
      parentId: notionId,
      connectorId: connector.id,
    },
  });
}

/**
 * Get children *that are databases* of a given notion page or database
 *
 * !! Not children *of a database*
 */
export async function getDatabaseChildrenOf(
  dataSourceInfo: DataSourceInfo,
  notionId: string
): Promise<NotionDatabase[]> {
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

  return NotionDatabase.findAll({
    where: {
      parentId: notionId,
      connectorId: connector.id,
    },
  });
}
