import assert from "assert";

import {
  buildDirectoryParents,
  getCodeDirInternalId,
  getCodeRootInternalId,
  getDirectoryUrl,
  getRepositoryInternalId,
} from "@connectors/connectors/github/lib/utils";
import { upsertDataSourceFolder } from "@connectors/lib/data_sources";
import { GithubCodeDirectory } from "@connectors/lib/models/github";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

/**
 * Upsert a code directory folder in the data source and create/update the database record.
 */
export async function upsertCodeDirectory({
  codeSyncStartedAt,
  connectorId,
  dataSourceConfig,
  defaultBranch,
  dirPath,
  repoId,
  repoLogin,
  repoName,
  updatedDirectoryIds = new Set(),
}: {
  codeSyncStartedAt: Date;
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  defaultBranch: string;
  dirPath: string;
  repoId: number;
  repoLogin: string;
  repoName: string;
  updatedDirectoryIds?: Set<string>;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  // Use shared parent logic.
  const { parentInternalId, parents } = buildDirectoryParents(repoId, dirPath);

  // Extract directory info.
  const internalId = getCodeDirInternalId(repoId, dirPath);
  const dirName = dirPath.split("/").pop() || "";

  // Build complete parents array for data source.
  const completeParents = [
    internalId,
    ...parents,
    getCodeRootInternalId(repoId),
    getRepositoryInternalId(repoId),
  ];

  // The parentId for data source is the immediate parent directory or root.
  const parentId = parentInternalId || getCodeRootInternalId(repoId);

  logger.debug(
    {
      connectorId,
      repoId,
      dirPath,
      dirName,
      internalId,
      parentId,
      parentsCount: completeParents.length,
    },
    "Upserting code directory"
  );

  const sourceUrl = getDirectoryUrl(
    repoLogin,
    repoName,
    defaultBranch,
    dirPath.split("/").slice(0, -1),
    dirName
  );

  // Upsert the folder in the data source.
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: internalId,
    parents: completeParents,
    parentId,
    title: dirName,
    mimeType: INTERNAL_MIME_TYPES.GITHUB.CODE_DIRECTORY,
    sourceUrl,
  });

  // Find or create directory in database.
  let githubCodeDirectory = await GithubCodeDirectory.findOne({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      internalId,
    },
  });

  if (!githubCodeDirectory) {
    githubCodeDirectory = await GithubCodeDirectory.create({
      codeUpdatedAt: codeSyncStartedAt,
      connectorId: connector.id,
      createdAt: codeSyncStartedAt,
      dirName,
      internalId,
      lastSeenAt: codeSyncStartedAt,
      parentInternalId: parentInternalId || getCodeRootInternalId(repoId),
      repoId: repoId.toString(),
      sourceUrl,
      updatedAt: codeSyncStartedAt,
    });

    logger.debug(
      { connectorId, repoId, dirPath, internalId },
      "Created new code directory record"
    );
  } else {
    // If the parents have updated then the internalId gets updated as well so we should never
    // have an update to parentInternalId. We check that this is always the case. If the
    // directory is moved (the parents change) then it will trigger the creation of a new
    // directory with a new internalId and the existing GithubCodeDirectory (with old
    // internalId) will be cleaned up at the end of the activity.
    assert(
      parentInternalId === githubCodeDirectory.parentInternalId,
      `Directory parentInternalId mismatch for ${connectorId}/${internalId}` +
        ` (expected ${parentInternalId}, got ${githubCodeDirectory.parentInternalId})`
    );

    // If some files were updated as part of the sync, refresh the directory updatedAt.
    if (updatedDirectoryIds.has(internalId)) {
      githubCodeDirectory.codeUpdatedAt = codeSyncStartedAt;
    }

    // Update everything else.
    githubCodeDirectory.dirName = dirName;
    githubCodeDirectory.sourceUrl = sourceUrl;
    githubCodeDirectory.lastSeenAt = codeSyncStartedAt;
    await githubCodeDirectory.save();

    logger.debug(
      { connectorId, repoId, dirPath, internalId },
      "Updated existing code directory record"
    );
  }
}
