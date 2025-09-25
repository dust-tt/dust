import assert from "assert";
import { hash as blake3 } from "blake3";

import { GCSRepositoryManager } from "@connectors/connectors/github/lib/code/gcs_repository";
import { MAX_FILE_SIZE_BYTES } from "@connectors/connectors/github/lib/code/tar_extraction";
import {
  getRepoUrl,
  inferParentsFromGcsPath,
} from "@connectors/connectors/github/lib/utils";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  renderPrefixSection,
  sectionLength,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import { GithubCodeFile } from "@connectors/lib/models/github";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

// Use for max text length the file size bytes we allow to be
// downloaded.
const MAX_DOCUMENT_TXT_LEN = MAX_FILE_SIZE_BYTES;

export async function formatCodeContentForUpsert(
  dataSourceConfig: DataSourceConfig,
  sourceUrl: string,
  content: Buffer
): Promise<CoreAPIDataSourceDocumentSection> {
  const c = await renderPrefixSection({
    dataSourceConfig,
    prefix: `SOURCE FILE: ${sourceUrl}\n\n`,
  });

  c.sections.push({
    prefix: null,
    content: content.toString(),
    sections: [],
  });

  return c;
}

/**
 * Upsert a code file document in the data source and create/update the database record.
 * Returns the directory IDs that were updated (for aggregation).
 */
export async function upsertCodeFile({
  codeSyncStartedAt,
  connectorId,
  dataSourceConfig,
  defaultBranch,
  gcsBasePath,
  gcsPath,
  repoId,
  repoLogin,
  repoName,
  relativePath,
  forceResync,
  isBatchSync,
  logger,
}: {
  codeSyncStartedAt: Date;
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  defaultBranch: string;
  gcsBasePath: string;
  gcsPath: string;
  repoId: number;
  repoLogin: string;
  repoName: string;
  relativePath: string;
  forceResync: boolean;
  isBatchSync: boolean;
  logger: Logger;
}): Promise<{
  updatedDirectoryIds: Set<string>;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const gcsManager = new GCSRepositoryManager();

  // Use inferParentsFromGcsPath to get all parent information.
  const { parentInternalId, parents, fileName } = inferParentsFromGcsPath({
    gcsBasePath,
    gcsPath,
    repoId,
  });

  const documentId = parents[0]!;

  // Read file content from GCS.
  const content = await gcsManager.downloadFile(gcsPath);

  const contentHash = blake3(content).toString("hex");

  // Construct source URL.
  const sourceUrl = `${getRepoUrl(repoLogin, repoName)}/blob/${defaultBranch}/${relativePath}`;

  // Find file or create it with an empty contentHash.
  const [githubCodeFile] = await GithubCodeFile.findOrCreate({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      documentId,
    },
    defaults: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      documentId,
      parentInternalId,
      fileName,
      sourceUrl,
      contentHash: "",
      createdAt: codeSyncStartedAt,
      updatedAt: codeSyncStartedAt,
      lastSeenAt: codeSyncStartedAt,
      codeUpdatedAt: codeSyncStartedAt,
    },
  });

  // If the parents have updated the documentId gets updated as well, so we should never
  // have an update to parentInternalId. We check that this is always the case. If the file
  // is moved (the parents change) then it will trigger the creation of a new file with a
  // new documentId and the existing GithubCodeFile (with old documentId) will be cleaned up
  // at the end of the activity.
  assert(
    parentInternalId === githubCodeFile.parentInternalId,
    `File parentInternalId mismatch for ${connector.id}/${documentId}` +
      ` (expected ${parentInternalId}, got ${githubCodeFile.parentInternalId})`
  );

  // Check if we need to update the file based on changes to name, URL, content or force flag.
  const needsUpdate =
    fileName !== githubCodeFile.fileName ||
    sourceUrl !== githubCodeFile.sourceUrl ||
    contentHash !== githubCodeFile.contentHash ||
    forceResync;

  const updatedDirectoryIds = new Set<string>();

  if (githubCodeFile.skipReason) {
    logger.info(
      {
        repoId,
        skipReason: githubCodeFile.skipReason,
        documentId,
      },
      "Skipping GitHub code file because of skip reason."
    );

    githubCodeFile.lastSeenAt = codeSyncStartedAt;
    await githubCodeFile.save();

    return { updatedDirectoryIds };
  }

  if (needsUpdate) {
    // Record the parent directories to update their updatedAt.
    for (const parentInternalId of parents) {
      updatedDirectoryIds.add(parentInternalId);
    }

    const renderedCode = await formatCodeContentForUpsert(
      dataSourceConfig,
      sourceUrl,
      content
    );

    if (sectionLength(renderedCode) > MAX_DOCUMENT_TXT_LEN) {
      logger.info("Code file is too large to upsert.");

      // Still update lastSeenAt even if we skip the file.
      githubCodeFile.lastSeenAt = codeSyncStartedAt;
      await githubCodeFile.save();

      return { updatedDirectoryIds: new Set() };
    }

    const tags = [
      `title:${fileName}`,
      `lasUpdatedAt:${codeSyncStartedAt.getTime()}`,
    ];

    // Time to upload the file to the data source.
    await upsertDataSourceDocument({
      async: true,
      dataSourceConfig,
      documentContent: renderedCode,
      documentId,
      documentUrl: sourceUrl,
      loggerArgs: logger.bindings(),
      mimeType: INTERNAL_MIME_TYPES.GITHUB.CODE_FILE,
      parentId: parentInternalId,
      parents,
      tags,
      timestampMs: codeSyncStartedAt.getTime(),
      title: fileName,
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
    });

    // Finally update the file.
    githubCodeFile.fileName = fileName;
    githubCodeFile.sourceUrl = sourceUrl;
    githubCodeFile.contentHash = contentHash;
    githubCodeFile.codeUpdatedAt = codeSyncStartedAt;
  } else {
    logger.info(
      {
        repoId,
        fileName: fileName,
        documentId: documentId,
      },
      "Skipping update of unchanged GithubCodeFile"
    );
  }

  // Finally we update the lastSeenAt for all files we've seen, and save.
  githubCodeFile.lastSeenAt = codeSyncStartedAt;
  await githubCodeFile.save();

  return { updatedDirectoryIds };
}
