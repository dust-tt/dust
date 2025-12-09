import { Op } from "sequelize";

import type { ConfluenceFolderRef } from "@connectors/connectors/confluence/lib/confluence_api";
import type { BaseConfluenceCheckAndUpsertSingleEntityActivityInput } from "@connectors/connectors/confluence/lib/content/types";
import {
  HiddenContentNodeParentId,
  makeConfluenceContentUrl,
} from "@connectors/connectors/confluence/lib/content/types";
import {
  makeEntityInternalId,
  makeFolderInternalId,
  makeSpaceInternalId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import { getConfluenceClient } from "@connectors/connectors/confluence/lib/utils";
import { fetchConfluenceConfigurationActivity } from "@connectors/connectors/confluence/temporal/activities";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import {
  deleteDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { ConfluenceFolderModel } from "@connectors/lib/models/confluence";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

async function markFolderHasVisited({
  connectorId,
  folderId,
  spaceId,
  visitedAtMs,
}: {
  connectorId: ModelId;
  folderId: string;
  spaceId: string;
  visitedAtMs: number;
}) {
  await ConfluenceFolderModel.update(
    {
      lastVisitedAt: new Date(visitedAtMs),
    },
    {
      where: {
        connectorId,
        folderId,
        spaceId,
      },
    }
  );
}

/**
 * Upsert logic.
 */

export async function confluenceCheckAndUpsertSingleFolder({
  connector,
  dataSourceConfig,
  folderRef,
  forceUpsert,
  space,
  visitedAtMs,
}: BaseConfluenceCheckAndUpsertSingleEntityActivityInput & {
  folderRef: ConfluenceFolderRef;
}) {
  const { id: spaceId } = space;
  const { id: folderId } = folderRef;

  const { id: connectorId } = connector;

  const loggerArgs = {
    connectorId,
    dataSourceId: dataSourceConfig.dataSourceId,
    folderId,
    spaceId,
    workspaceId: dataSourceConfig.workspaceId,
  };
  const localLogger = logger.child(loggerArgs);

  const folderAlreadyInDb = await ConfluenceFolderModel.findOne({
    attributes: ["parentId", "skipReason", "version"],
    where: {
      connectorId,
      folderId,
    },
  });

  const isFolderSkipped = Boolean(
    folderAlreadyInDb && folderAlreadyInDb.skipReason !== null
  );
  if (isFolderSkipped) {
    logger.info("Confluence folder skipped.");

    // If a folder is skipped, we skip all its children.
    return false;
  }

  const confluenceConfig =
    await fetchConfluenceConfigurationActivity(connectorId);

  const client = await getConfluenceClient(
    {
      cloudId: confluenceConfig.cloudId,
    },
    connector
  );

  // Check restrictions.
  const { hasReadRestrictions } = folderRef;
  if (hasReadRestrictions) {
    localLogger.info("Skipping restricted Confluence folder.");
    return false;
  }

  // Check the version.
  const isSameVersion =
    folderAlreadyInDb && folderAlreadyInDb.version === folderRef.version;

  // Check whether the folder was moved (the version is not bumped when a folder is moved).
  const folderWasMoved =
    folderAlreadyInDb && folderAlreadyInDb.parentId !== folderRef.parentId;

  // Only index in DB if the folder does not exist, has been moved, or we want to upsert.
  if (isSameVersion && !forceUpsert && !folderWasMoved) {
    // Simply record that we visited the folder.
    await markFolderHasVisited({
      connectorId,
      folderId,
      spaceId,
      visitedAtMs,
    });

    return true;
  }

  // There is a small delta between the folder being listed and the folder being imported.
  // If the folder has been deleted in the meantime, we should ignore it.
  const folder = await client.getFolderById(folderId);
  if (!folder) {
    localLogger.info("Confluence folder not found.");
    // Return false to skip the child content.
    return false;
  }

  let parents: [string, string, ...string[]];
  if (folder.parentId && folder.parentType) {
    // Exact parent Ids will be computed after all content imports within the space have been completed.
    parents = [
      makeFolderInternalId(folder.id),
      makeEntityInternalId(folder.parentType, folder.parentId),
      HiddenContentNodeParentId,
    ];
  } else {
    // In this case we already have the exact parents: the folder itself and the space.
    parents = [makeFolderInternalId(folder.id), makeSpaceInternalId(spaceId)];
  }

  const parentId = parents[1];
  const contentUrl = makeConfluenceContentUrl({
    baseUrl: confluenceConfig.url,
    suffix: folder._links.tinyui,
  });

  localLogger.info("Upserting Confluence folder.");
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: makeFolderInternalId(folderId),
    mimeType: INTERNAL_MIME_TYPES.CONFLUENCE.FOLDER,
    parentId,
    parents,
    sourceUrl: contentUrl,
    title: folder.title,
  });

  localLogger.info("Upserting Confluence folder in DB.");
  await ConfluenceFolderModel.upsert({
    connectorId,
    externalUrl: folder._links.tinyui,
    folderId,
    lastVisitedAt: new Date(visitedAtMs),
    parentId: folder.parentId,
    parentType: folder.parentType,
    spaceId,
    title: folder.title,
    version: folder.version.number,
  });

  return true;
}

/**
 * Garbage collect logic.
 */

async function deleteFolder(
  connectorId: ModelId,
  folderId: string,
  dataSourceConfig: DataSourceConfig
) {
  const loggerArgs = {
    connectorId,
    folderId,
  };

  const localLogger = logger.child(loggerArgs);

  const documentId = makeFolderInternalId(folderId);
  localLogger.info(
    { documentId },
    "Deleting Confluence folder from Dust data source."
  );

  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: makeFolderInternalId(folderId),
  });

  localLogger.info("Deleting Confluence folder from database.");
  await ConfluenceFolderModel.destroy({
    where: {
      connectorId,
      folderId,
    },
  });
}

export async function confluenceRemoveUnvisitedFolders({
  connector,
  dataSourceConfig,
  lastVisitedAt,
  spaceId,
}: {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  lastVisitedAt: number;
  spaceId: string;
}) {
  const { id: connectorId } = connector;

  const unvisitedFolders = await ConfluenceFolderModel.findAll({
    attributes: ["folderId"],
    where: {
      connectorId,
      spaceId,
      lastVisitedAt: {
        [Op.ne]: new Date(lastVisitedAt),
      },
    },
  });

  for (const folder of unvisitedFolders) {
    await deleteFolder(connectorId, folder.folderId, dataSourceConfig);
  }
}

export async function confluenceRemoveAllFoldersInSpace({
  connector,
  dataSourceConfig,
  spaceId,
}: {
  connector: ConnectorResource;
  dataSourceConfig: DataSourceConfig;
  spaceId: string;
}) {
  const { id: connectorId } = connector;

  const allFolders = await ConfluenceFolderModel.findAll({
    attributes: ["folderId"],
    where: {
      connectorId,
      spaceId,
    },
  });

  for (const folder of allFolders) {
    await deleteFolder(connectorId, folder.folderId, dataSourceConfig);
  }
}
