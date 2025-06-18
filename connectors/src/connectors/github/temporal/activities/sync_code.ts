import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Readable } from "stream";

import { upsertCodeDirectory } from "@connectors/connectors/github/lib/code/directory_operations";
import { upsertCodeFile } from "@connectors/connectors/github/lib/code/file_operations";
import { garbageCollectCodeSync } from "@connectors/connectors/github/lib/code/garbage_collect";
import { GCSRepositoryManager } from "@connectors/connectors/github/lib/code/gcs_repository";
import { extractGitHubTarballToGCS } from "@connectors/connectors/github/lib/code/tar_extraction";
import { RepositoryAccessBlockedError } from "@connectors/connectors/github/lib/errors";
import { getOctokit } from "@connectors/connectors/github/lib/github_api";
import {
  getRepoInfo,
  isRepoTooLarge,
} from "@connectors/connectors/github/lib/github_code";
import {
  getCodeDirInternalId,
  getCodeRootInternalId,
  getRepositoryInternalId,
  getRepoUrl,
} from "@connectors/connectors/github/lib/utils";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  deleteDataSourceFolder,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import {
  GithubCodeRepository,
  GithubConnectorState,
} from "@connectors/lib/models/github";
import { heartbeat } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";

const PARALLEL_FILE_UPLOADS = 15;
const PARALLEL_DIRECTORY_UPLOADS = 10;

export async function githubExtractToGcsActivity({
  connectorId,
  dataSourceConfig,
  repoLogin,
  repoName,
  repoId,
}: {
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  repoLogin: string;
  repoName: string;
  repoId: number;
}): Promise<{
  gcsBasePath: string;
} | null> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  // Get GitHub client.
  const octokit = await getOctokit(connector);

  const repoInfoRes = await getRepoInfo(octokit, {
    repoLogin,
    repoName,
  });

  if (repoInfoRes.isErr()) {
    throw repoInfoRes.error;
  }

  const repoInfo = repoInfoRes.value;

  // If repo is too large, simply return null, to be handled by the caller.
  if (isRepoTooLarge(repoInfo)) {
    return null;
  }

  octokit.request.defaults({
    request: {
      parseSuccessResponseBody: false,
    },
  });

  // Get tarball stream from GitHub.
  const tarballResponse = await octokit.request(
    "GET /repos/{owner}/{repo}/tarball/{ref}",
    {
      owner: repoLogin,
      repo: repoName,
      ref: repoInfo.default_branch,
      request: {
        parseSuccessResponseBody: false,
      },
    }
  );

  const tarballStream = (tarballResponse as { data: Readable }).data;

  const extractResult = await extractGitHubTarballToGCS(tarballStream, {
    repoId,
    connectorId,
  });

  if (extractResult.isErr()) {
    if (
      extractResult.error instanceof ExternalOAuthTokenError ||
      extractResult.error instanceof RepositoryAccessBlockedError
    ) {
      logger.info(
        { err: extractResult.error },
        "Missing Github repository: Garbage collecting repo."
      );

      await garbageCollectCodeSync(
        dataSourceConfig,
        connector,
        repoId,
        new Date(),
        logger.child({ task: "garbageCollectRepoNotFound" })
      );

      await heartbeat();

      // deleting the code root folder from data_source_folders (core)
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getCodeRootInternalId(repoId),
      });

      // Finally delete the repository object if it exists.
      await GithubCodeRepository.destroy({
        where: {
          connectorId: connector.id,
          repoId: repoId.toString(),
        },
      });

      return null;
    }

    throw extractResult.error;
  }

  const { gcsBasePath } = extractResult.value;

  return {
    gcsBasePath,
  };
}

// Activity to get GCS files organized by depth for hierarchical processing.
export async function githubGetGcsFilesByDepthActivity({
  gcsBasePath,
  repoId,
  batchSize = 50,
}: {
  gcsBasePath: string;
  repoId: number;
  batchSize?: number;
}): Promise<{
  directoryBatches: Array<{
    depth: number;
    directories: Array<{
      gcsPath: string;
      dirPath: string;
      internalId: string;
      parentInternalId: string | null;
    }>;
  }>;
  fileBatches: Array<{
    depth: number;
    files: Array<{
      gcsPath: string;
      relativePath: string;
    }>;
  }>;
}> {
  const gcsManager = new GCSRepositoryManager();
  const { directoryBatches: rawDirBatches, fileBatches: rawFileBatches } =
    await gcsManager.organizeFilesByDepth(gcsBasePath, batchSize);

  // Add internal IDs for directories.
  const directoryBatches = rawDirBatches.map((batch) => ({
    ...batch,
    directories: batch.directories.map((dir) => ({
      ...dir,
      internalId: getCodeDirInternalId(repoId, dir.dirPath),
      parentInternalId: dir.dirPath.includes("/")
        ? getCodeDirInternalId(
            repoId,
            dir.dirPath.split("/").slice(0, -1).join("/")
          )
        : null,
    })),
  }));

  return { directoryBatches, fileBatches: rawFileBatches };
}

// Activity to process a chunk of directories with concurrency control.
export async function githubProcessDirectoryChunkActivity({
  codeSyncStartedAt,
  connectorId,
  dataSourceConfig,
  defaultBranch,
  directories,
  repoId,
  repoLogin,
  repoName,
  updatedDirectoryIds,
}: {
  codeSyncStartedAt: Date;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  defaultBranch: string;
  directories: Array<{
    gcsPath: string;
    dirPath: string;
    internalId: string;
    parentInternalId: string | null;
  }>;
  repoId: number;
  repoLogin: string;
  repoName: string;
  updatedDirectoryIds?: Set<string>;
}) {
  const results = await concurrentExecutor(
    directories,
    async (dir) => {
      await upsertCodeDirectory({
        codeSyncStartedAt,
        connectorId,
        dataSourceConfig,
        defaultBranch,
        dirPath: dir.dirPath,
        repoId,
        repoLogin,
        repoName,
        updatedDirectoryIds,
      });
    },
    { concurrency: PARALLEL_DIRECTORY_UPLOADS }
  );

  return { processedDirectories: results.length };
}

// Activity to process a chunk of files with concurrency control.
export async function githubProcessFileChunkActivity({
  connectorId,
  codeSyncStartedAt,
  repoId,
  repoLogin,
  repoName,
  gcsBasePath,
  files,
  dataSourceConfig,
  forceResync = false,
  isBatchSync = false,
}: {
  connectorId: number;
  codeSyncStartedAt: Date;
  repoId: number;
  repoLogin: string;
  repoName: string;
  gcsBasePath: string;
  files: Array<{
    gcsPath: string;
    relativePath: string;
  }>;
  dataSourceConfig: DataSourceConfig;
  forceResync?: boolean;
  isBatchSync?: boolean;
}): Promise<{
  processedFiles: number;
  updatedDirectoryIds: string[];
}> {
  const updatedDirectoryIdsSet = new Set<string>();

  const results = await concurrentExecutor(
    files,
    async (file) => {
      const result = await upsertCodeFile({
        codeSyncStartedAt,
        connectorId,
        dataSourceConfig,
        gcsBasePath,
        gcsPath: file.gcsPath,
        repoId,
        repoLogin,
        repoName,
        relativePath: file.relativePath,
        forceResync,
        isBatchSync,
      });

      // Aggregate updated directory IDs.
      for (const dirId of result.updatedDirectoryIds) {
        updatedDirectoryIdsSet.add(dirId);
      }

      return result;
    },
    { concurrency: PARALLEL_FILE_UPLOADS }
  );

  return {
    processedFiles: results.length,
    updatedDirectoryIds: Array.from(updatedDirectoryIdsSet),
  };
}

export async function githubCleanupCodeSyncActivity({
  codeSyncStartedAt,
  connectorId,
  dataSourceConfig,
  repoId,
  repoUpdatedAt,
}: {
  codeSyncStartedAt: Date;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  repoId: number;
  repoUpdatedAt: Date | undefined;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  // Delete files and directories not seen during sync.
  await garbageCollectCodeSync(
    dataSourceConfig,
    connector,
    repoId,
    codeSyncStartedAt,
    logger.child({ task: "garbageCollectCodeSync" })
  );

  // Delete the GCS repository.
  const gcsManager = new GCSRepositoryManager();
  await gcsManager.deleteRepository(connectorId, repoId);

  const githubCodeRepository = await GithubCodeRepository.findOne({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
    },
  });

  assert(githubCodeRepository, "GithubCodeRepository not found");

  // Finally we update the repository updatedAt value.
  if (repoUpdatedAt) {
    githubCodeRepository.codeUpdatedAt = repoUpdatedAt;
    await githubCodeRepository.save();
  }
}

export async function githubEnsureCodeSyncEnabledActivity({
  codeSyncStartedAt,
  connectorId,
  dataSourceConfig,
  repoId,
  repoLogin,
  repoName,
}: {
  codeSyncStartedAt: Date;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  repoId: number;
  repoLogin: string;
  repoName: string;
}): Promise<boolean> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }

  const connectorState = await GithubConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!connectorState) {
    throw new Error(`Connector state not found for connector ${connector.id}`);
  }

  // If code sync is disabled, we need to garbage collect any existing code files.
  if (!connectorState.codeSyncEnabled) {
    logger.info(
      { connectorId, repoId, repoLogin, repoName },
      "Code sync disabled for connector"
    );

    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      codeSyncStartedAt,
      logger.child({ task: "garbageCollectCodeSyncDisabled" })
    );

    // Deleting the code root folder from data_source_folders (core).
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: getCodeRootInternalId(repoId),
    });

    // Finally delete the repository object if it exists.
    await GithubCodeRepository.destroy({
      where: {
        connectorId: connector.id,
        repoId: repoId.toString(),
      },
    });

    return false;
  }

  let githubCodeRepository = await GithubCodeRepository.findOne({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
    },
  });

  if (githubCodeRepository && githubCodeRepository.skipReason) {
    logger.info(
      { skipReason: githubCodeRepository.skipReason },
      "Repository skipped, not syncing."
    );

    return false;
  }

  const sourceUrl = getRepoUrl(repoLogin, repoName);

  // Upserting a folder for the code root in data_source_folders (core).
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: getCodeRootInternalId(repoId),
    title: "Code",
    parents: [getCodeRootInternalId(repoId), getRepositoryInternalId(repoId)],
    parentId: getRepositoryInternalId(repoId),
    mimeType: INTERNAL_MIME_TYPES.GITHUB.CODE_ROOT,
    sourceUrl,
  });

  if (!githubCodeRepository) {
    githubCodeRepository = await GithubCodeRepository.create({
      connectorId: connector.id,
      repoId: repoId.toString(),
      repoLogin,
      repoName,
      createdAt: codeSyncStartedAt,
      updatedAt: codeSyncStartedAt,
      lastSeenAt: codeSyncStartedAt,
      sourceUrl,
      forceDailySync: false,
    });
  } else {
    // We update the repo name and source url in case they changed. We also update the lastSeenAt as
    // soon as possible to prevent further attempt to incrementally synchronize it.
    githubCodeRepository.repoName = repoName;
    githubCodeRepository.sourceUrl = sourceUrl;
    githubCodeRepository.lastSeenAt = codeSyncStartedAt;
    await githubCodeRepository.save();
  }

  return true;
}
