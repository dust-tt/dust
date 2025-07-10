import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import type { Readable } from "stream";

import { upsertCodeDirectory } from "@connectors/connectors/github/lib/code/directory_operations";
import { upsertCodeFile } from "@connectors/connectors/github/lib/code/file_operations";
import { garbageCollectCodeSync } from "@connectors/connectors/github/lib/code/garbage_collect";
import {
  DIRECTORY_PLACEHOLDER_FILE,
  GCSRepositoryManager,
} from "@connectors/connectors/github/lib/code/gcs_repository";
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
const GCS_FILES_BATCH_SIZE = 500;

const GITHUB_TARBALL_DOWNLOAD_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes.

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
  repoInfo: RepositoryInfo;
} | null> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  // Local cleanup function to handle missing/inaccessible repositories
  const cleanupMissingRepository = async (loggerTask: string) => {
    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      new Date(),
      logger.child({ task: loggerTask })
    );

    await heartbeat();

    // Deleting the code root folder from data_source_folders (core)
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
  if (isRepoTooLarge(repoInfo)) {
    return null;
  }

  octokit.request.defaults({
    request: {
      parseSuccessResponseBody: false,
    },
  });

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

export interface DirectoryListing {
  dirPath: string;
  gcsPath: string;
  internalId: string;
  parentInternalId: string | null;
}

interface FileListing {
  gcsPath: string;
  relativePath: string;
}

// Activity to get GCS files with simple pagination to avoid Temporal return size limits.
export async function githubGetGcsFilesActivity({
  batchSize = GCS_FILES_BATCH_SIZE,
  gcsBasePath,
  pageToken,
  repoId,
}: {
  batchSize?: number;
  gcsBasePath: string;
  pageToken?: string;
  repoId: number;
}): Promise<{
  directories: DirectoryListing[];
  files: FileListing[];
  nextPageToken?: string;
  hasMore: boolean;
}> {
  const gcsManager = new GCSRepositoryManager();
  const {
    files: paginatedFiles,
    nextPageToken,
    hasMore,
  } = await gcsManager.listFiles(gcsBasePath, {
    maxResults: batchSize,
    pageToken,
  });

  const directories: DirectoryListing[] = [];
  const files: FileListing[] = [];

  for (const file of paginatedFiles) {
    const relativePath = file.name.replace(`${gcsBasePath}/`, "");

    if (file.name.endsWith(`/${DIRECTORY_PLACEHOLDER_FILE}`)) {
      // This is a directory placeholder.
      const dirPath = relativePath.replace(
        `/${DIRECTORY_PLACEHOLDER_FILE}`,
        ""
      );
      directories.push({
        gcsPath: file.name,
        dirPath,
        internalId: getCodeDirInternalId(repoId, dirPath),
        parentInternalId: dirPath.includes("/")
          ? getCodeDirInternalId(
              repoId,
              dirPath.split("/").slice(0, -1).join("/")
            )
          : null,
      });
    } else {
      // This is a regular file.
      files.push({
        gcsPath: file.name,
        relativePath,
      });
    }
  }

  return {
    directories,
    files,
    nextPageToken,
    hasMore,
  };
}

// Activity to process a chunk of directories with concurrency control.
export async function githubProcessDirectoryChunkActivity({
  codeSyncStartedAtMs,
  connectorId,
  dataSourceConfig,
  defaultBranch,
  directories,
  repoId,
  repoLogin,
  repoName,
  updatedDirectoryIdsArray,
}: {
  codeSyncStartedAtMs: number;
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
  updatedDirectoryIdsArray?: string[];
}) {
  const codeSyncStartedAt = new Date(codeSyncStartedAtMs);

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
        updatedDirectoryIds: new Set(updatedDirectoryIdsArray),
      });
    },
    { concurrency: PARALLEL_DIRECTORY_UPLOADS }
  );

  return { processedDirectories: results.length };
}

// Activity to process a chunk of files with concurrency control.
export async function githubProcessFileChunkActivity({
  codeSyncStartedAtMs,
  connectorId,
  dataSourceConfig,
  defaultBranch,
  files,
  forceResync = false,
  gcsBasePath,
  isBatchSync = false,
  repoId,
  repoLogin,
  repoName,
}: {
  codeSyncStartedAtMs: number;
  connectorId: number;
  dataSourceConfig: DataSourceConfig;
  defaultBranch: string;
  files: Array<{
    gcsPath: string;
    relativePath: string;
  }>;
  forceResync?: boolean;
  gcsBasePath: string;
  isBatchSync?: boolean;
  repoId: number;
  repoLogin: string;
  repoName: string;
}): Promise<{
  processedFiles: number;
  updatedDirectoryIds: string[];
}> {
  const codeSyncStartedAt = new Date(codeSyncStartedAtMs);
  const updatedDirectoryIdsSet = new Set<string>();

  const results = await concurrentExecutor(
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
