import {
  NotionDatabaseModel,
  NotionPageModel,
} from "@connectors/lib/models/notion";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import type { DataSourceInfo } from "@connectors/types";

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
}): Promise<NotionPageModel> {
  const connector = await ConnectorResource.findByDataSource(dataSourceInfo);
  if (!connector || connector.type !== "notion") {
    throw new Error("Could not find connector");
  }
  const page = await NotionPageModel.findOne({
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
    return NotionPageModel.create({
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
): Promise<NotionPageModel | null> {
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

  return NotionPageModel.findOne({ where });
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
  requestQueuingForUpsertToCore,
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
  requestQueuingForUpsertToCore: boolean;
}): Promise<NotionDatabaseModel> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const database = await NotionDatabaseModel.findOne({
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
    upsertRequestedRunTs?: Date;
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

  if (requestQueuingForUpsertToCore) {
    // We want to queue the database for upsert.
    // If we never queued the database for upsert, or if we haven't queued it since
    // the last time we upserted it, we queue it.
    // Otherwise, the database is already queued for upsert.
    if (
      !database?.upsertRequestedRunTs ||
      (database.lastUpsertedRunTs &&
        database.lastUpsertedRunTs > database.upsertRequestedRunTs)
    ) {
      updateParams.upsertRequestedRunTs = new Date(runTimestamp);
    }
  }

  if (database) {
    return database.update(updateParams);
  } else {
    return NotionDatabaseModel.create({
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
): Promise<NotionDatabaseModel | null> {
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

  return NotionDatabaseModel.findOne({ where });
}

/**
 * Get children *that are pages* of a given notion page or database
 *
 * !! Not children *of a page*
 */
export async function getPageChildrenOf(
  connectorId: ModelId,
  notionId: string
): Promise<NotionPageModel[]> {
  return NotionPageModel.findAll({
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
): Promise<NotionDatabaseModel[]> {
  return NotionDatabaseModel.findAll({
    where: {
      parentId: notionId,
      connectorId: connectorId,
    },
  });
}
