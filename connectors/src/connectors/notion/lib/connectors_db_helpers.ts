import type { ModelId } from "@dust-tt/types";

import { NotionDatabase, NotionPage } from "@connectors/lib/models/notion";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceInfo } from "@connectors/types/data_source_config";

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
  const connector = await ConnectorResource.findByDataSource(dataSourceInfo);
  if (!connector || connector.type !== "notion") {
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
    lastCreatedOrMovedRunTs?: Date;
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
    updateParams.lastCreatedOrMovedRunTs = new Date(lastCreatedOrMovedRunTs);
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
  connectorId: ModelId,
  notionPageId: string,
  lastSeenTs?: number
): Promise<NotionPage | null> {
  const where: {
    notionPageId: string;
    connectorId: ModelId;
    lastSeenTs?: Date;
  } = {
    notionPageId,
    connectorId,
  };

  if (lastSeenTs) {
    where.lastSeenTs = new Date(lastSeenTs);
  }

  return NotionPage.findOne({ where });
}

// Note: this function does not let you "remove" a skipReason.
export async function upsertNotionDatabaseInConnectorsDb({
  connectorId,
  notionDatabaseId,
  runTimestamp,
  parentType,
  parentId,
  title,
  notionUrl,
  skipReason,
  lastCreatedOrMovedRunTs,
}: {
  connectorId: ModelId;
  notionDatabaseId: string;
  runTimestamp: number;
  parentType?: string | null;
  parentId?: string | null;
  title?: string | null;
  notionUrl?: string | null;
  skipReason?: string;
  lastCreatedOrMovedRunTs?: number;
}): Promise<NotionDatabase> {
  const connector = await ConnectorResource.fetchById(connectorId);
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
    lastCreatedOrMovedRunTs?: Date;
    firstSeenTs?: Date;
  } = {
    lastSeenTs: new Date(runTimestamp),
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
    updateParams.lastCreatedOrMovedRunTs = new Date(lastCreatedOrMovedRunTs);
  }

  // Needed for backwards compatibility with databases that were created before
  // firstSeenTs was added.
  if (!database?.firstSeenTs) {
    updateParams.firstSeenTs = new Date(runTimestamp);
  }

  if (database) {
    return database.update(updateParams);
  } else {
    return NotionDatabase.create({
      notionDatabaseId,
      connectorId: connector.id,
      firstSeenTs: new Date(runTimestamp),
      ...updateParams,
    });
  }
}

export async function getNotionDatabaseFromConnectorsDb(
  connectorId: ModelId,
  notionDatabaseId: string,
  lastSeenTs?: number
): Promise<NotionDatabase | null> {
  const where: {
    notionDatabaseId: string;
    connectorId: ModelId;
    lastSeenTs?: Date;
  } = {
    notionDatabaseId,
    connectorId,
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
  connectorId: ModelId,
  notionId: string
): Promise<NotionPage[]> {
  return NotionPage.findAll({
    where: {
      parentId: notionId,
      connectorId: connectorId,
    },
  });
}

/**
 * Get children *that are databases* of a given notion page or database
 *
 * !! Not children *of a database*
 */
export async function getDatabaseChildrenOf(
  connectorId: ModelId,
  notionId: string
): Promise<NotionDatabase[]> {
  return NotionDatabase.findAll({
    where: {
      parentId: notionId,
      connectorId: connectorId,
    },
  });
}
