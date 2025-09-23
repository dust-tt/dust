import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Readable } from "stream";

import { upsertCodeDirectory } from "@connectors/connectors/github/lib/code/directory_operations";
import { upsertCodeFile } from "@connectors/connectors/github/lib/code/file_operations";
import { garbageCollectCodeSync } from "@connectors/connectors/github/lib/code/garbage_collect";
import { GCSRepositoryManager } from "@connectors/connectors/github/lib/code/gcs_repository";
import { extractGitHubTarballToGCS } from "@connectors/connectors/github/lib/code/tar_extraction";
import {
  isGithubRequestErrorNotFound,
  RepositoryAccessBlockedError,
} from "@connectors/connectors/github/lib/errors";
import { getOctokit } from "@connectors/connectors/github/lib/github_api";
import type { RepositoryInfo } from "@connectors/connectors/github/lib/github_code";
import {
  getRepoInfo,
  isRepoTooLarge,
} from "@connectors/connectors/github/lib/github_code";
import {
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
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";

// Files are uploaded asynchronously, so we can use a high number of parallel uploads.
const PARALLEL_FILE_UPLOADS = 128;
// Directories are uploaded synchronously, so we need to use a lower number of parallel uploads.
const PARALLEL_DIRECTORY_UPLOADS = 64;

const GITHUB_TARBALL_DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes.

export async function githubExtractToGcsActivity({
  connectorId,
  dataSourceConfig,
  repoLogin,
  repoName,
  repoId,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  repoLogin: string;
  repoName: string;
  repoId: number;
}): Promise<{
  gcsBasePath: string;
  repoInfo: RepositoryInfo;
} | null> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector, {
    repoName,
    repoLogin,
    repoId,
    activityName: "githubExtractToGcsActivity",
  });

  // Local cleanup function to handle missing/inaccessible repositories.
  const cleanupMissingRepository = async (loggerTask: string) => {
    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      new Date(),
      logger.child({ task: loggerTask })
    );

    await heartbeat();

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
  };

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
  if (isRepoTooLarge(repoInfo, connector)) {
    return null;
  }

  octokit.request.defaults({
    request: {
      parseSuccessResponseBody: false,
    },
  });

  logger.info("Fetching GitHub repository tarball");

  // Get tarball stream from GitHub.
  let tarballResponse;
  try {
    tarballResponse = await octokit.request(
      "GET /repos/{owner}/{repo}/tarball/{ref}",
      {
        owner: repoLogin,
        repo: repoName,
        ref: repoInfo.default_branch,
        request: {
          parseSuccessResponseBody: false,
          timeout: GITHUB_TARBALL_DOWNLOAD_TIMEOUT_MS,
        },
      }
    );
  } catch (error) {
    if (isGithubRequestErrorNotFound(error)) {
      logger.info(
        { err: error, repoLogin, repoName, repoId },
        "Repository tarball not found (404): Garbage collecting repo."
      );

      await cleanupMissingRepository("garbageCollectRepoNotFound");

      return null;
    }

    throw error;
  }

  const tarballStream = (tarballResponse as { data: Readable }).data;

  logger.info("Extracting GitHub repository tarball to GCS");

  const extractResult = await extractGitHubTarballToGCS(
    tarballStream,
    {
      repoId,
      connectorId,
    },
    logger
  );

  if (extractResult.isErr()) {
    if (
      extractResult.error instanceof ExternalOAuthTokenError ||
      extractResult.error instanceof RepositoryAccessBlockedError
    ) {
      logger.info(
        { err: extractResult.error },
        "Missing Github repository: Garbage collecting repo."
      );

      await cleanupMissingRepository("garbageCollectRepoNotFound");

      return null;
    }

    throw extractResult.error;
  }

  const { gcsBasePath } = extractResult.value;

  return {
    gcsBasePath,
    repoInfo,
  };
}

// Activity to create multiple index files with file paths to optimize temporal memory usage.
export async function githubCreateGcsIndexActivity({
  connectorId,
  gcsBasePath,
  repoId,
  repoLogin,
  repoName,
}: {
  connectorId: ModelId;
  gcsBasePath: string;
  repoId: number;
  repoLogin: string;
  repoName: string;
}): Promise<{
  indexPaths: string[];
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector, {
    repoId,
    repoLogin,
    repoName,
    gcsBasePath,
    activityName: "githubCreateGcsIndexActivity",
  });
  const gcsManager = new GCSRepositoryManager();

  const indexPaths = await gcsManager.createIndexFiles(gcsBasePath, repoId, {
    childLogger: logger,
  });

  return {
    indexPaths,
  };
}

// Activity to process all files from a single index file.
export async function githubProcessIndexFileActivity({
  codeSyncStartedAtMs,
  connectorId,
  dataSourceConfig,
  defaultBranch,
  forceResync = false,
  gcsBasePath,
  indexPath,
  isBatchSync = false,
  repoId,
  repoLogin,
  repoName,
}: {
  codeSyncStartedAtMs: number;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  defaultBranch: string;
  forceResync?: boolean;
  gcsBasePath: string;
  indexPath: string;
  isBatchSync?: boolean;
  repoId: number;
  repoLogin: string;
  repoName: string;
}): Promise<{
  processedFiles: number;
  processedDirectories: number;
  updatedDirectoryIds: string[];
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector, {
    repoId,
    repoLogin,
    repoName,
    gcsBasePath,
    indexPath,
    activityName: "githubProcessIndexFileActivity",
  });

  const gcsManager = new GCSRepositoryManager();

  // Read all files and directories from this index.
  const files = await gcsManager.readFilesFromIndex(indexPath, gcsBasePath);
  const directories = await gcsManager.readDirectoriesFromIndex({
    expectedGcsBasePath: gcsBasePath,
    indexPath,
  });

  const codeSyncStartedAt = new Date(codeSyncStartedAtMs);
  const updatedDirectoryIdsSet = new Set<string>();

  logger.info("Processed index file");

  // Process all files.
  const fileResults = await concurrentExecutor(
    files,
    async (file) => {
      const result = await upsertCodeFile({
        codeSyncStartedAt,
        connectorId,
        dataSourceConfig,
        defaultBranch,
        gcsBasePath,
        gcsPath: file.gcsPath,
        repoId,
        repoLogin,
        repoName,
        relativePath: file.relativePath,
        forceResync,
        isBatchSync,
        logger: logger.child({
          task: "upsertCodeFile",
          relativePath: file.relativePath,
        }),
      });

      // Aggregate updated directory IDs.
      for (const dirId of result.updatedDirectoryIds) {
        updatedDirectoryIdsSet.add(dirId);
      }

      return result;
    },
    { concurrency: PARALLEL_FILE_UPLOADS }
  );

  // Process all directories.
  const directoryResults = await concurrentExecutor(
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
        updatedDirectoryIds: updatedDirectoryIdsSet,
        logger: logger.child({
          task: "upsertCodeDirectory",
          dirPath: dir.dirPath,
        }),
      });
    },
    { concurrency: PARALLEL_DIRECTORY_UPLOADS }
  );

  logger.info(
    {
      processedFiles: fileResults.length,
      processedDirectories: directoryResults.length,
    },
    "Processed index file"
  );

  return {
    processedFiles: fileResults.length,
    processedDirectories: directoryResults.length,
    updatedDirectoryIds: Array.from(updatedDirectoryIdsSet),
  };
}

export async function githubCleanupCodeSyncActivity({
  codeSyncStartedAtMs,
  connectorId,
  dataSourceConfig,
  repoId,
  repoUpdatedAt,
}: {
  codeSyncStartedAtMs: number;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  repoId: number;
  repoUpdatedAt: Date | undefined;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const logger = getActivityLogger(connector, {
    repoId,
    activityName: "githubCleanupCodeSyncActivity",
  });

  const codeSyncStartedAt = new Date(codeSyncStartedAtMs);

  // Delete files and directories not seen during sync.
  await garbageCollectCodeSync(
    dataSourceConfig,
    connector,
    repoId,
    codeSyncStartedAt,
    logger.child({ task: "garbageCollectCodeSync" })
  );

  // No need to delete the GCS repository, it will be deleted by the bucket lifecycle policy.

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
  codeSyncStartedAtMs,
  connectorId,
  dataSourceConfig,
  repoId,
  repoLogin,
  repoName,
}: {
  codeSyncStartedAtMs: number;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  repoId: number;
  repoLogin: string;
  repoName: string;
}): Promise<boolean> {
  const codeSyncStartedAt = new Date(codeSyncStartedAtMs);

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }

  const logger = getActivityLogger(connector, {
    repoId,
    repoLogin,
    repoName,
    activityName: "githubEnsureCodeSyncEnabledActivity",
  });

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
