import assert from "assert";
import { hash as blake3 } from "blake3";

import { GCSRepositoryManager } from "@connectors/connectors/github/lib/code/gcs_repository";
import {
  getCodeFileInternalId,
  getCodeRootInternalId,
  getRepositoryInternalId,
  inferParentsFromGcsPath,
} from "@connectors/connectors/github/lib/utils";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  sectionLength,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import { GithubCodeFile } from "@connectors/lib/models/github";
import { heartbeat } from "@connectors/lib/temporal";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

// Only allow documents up to 5mb to be processed.
const MAX_DOCUMENT_TXT_LEN = 5 * 1000 * 1000; // 5MB

export function formatCodeContentForUpsert(
  sourceUrl: string,
  content: Buffer
): CoreAPIDataSourceDocumentSection {
  // For now we simply add the file name as prefix to all chunks.
  return {
    prefix: `SOURCE FILE: ${sourceUrl}\n\n`,
    content: content.toString(),
    sections: [],
  };
}

/**
 * Upsert a code file document in the data source and create/update the database record.
 * Returns the directory IDs that were updated (for aggregation).
 */
export async function upsertCodeFile({
  codeSyncStartedAt,
  connectorId,
  dataSourceConfig,
  gcsBasePath,
  gcsPath,
  repoId,
  repoLogin,
  repoName,
  relativePath,
  forceResync = false,
  isBatchSync = false,
}: {
  codeSyncStartedAt: Date;
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  gcsBasePath: string;
  gcsPath: string;
  repoId: number;
  repoLogin: string;
  repoName: string;
  relativePath: string;
  forceResync?: boolean;
  isBatchSync?: boolean;
}): Promise<{
  updatedDirectoryIds: Set<string>;
}> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }

  const gcsManager = new GCSRepositoryManager();
  const rootInternalId = getCodeRootInternalId(repoId);

  // Use inferParentsFromGcsPath to get all parent information.
  const { parentInternalId, parents, fileName } = inferParentsFromGcsPath({
    gcsBasePath,
    gcsPath,
    repoId,
  });

  const documentId = getCodeFileInternalId(repoId, relativePath);
  const finalParentInternalId = parentInternalId || rootInternalId;

  // Extract fileParents (skip the file itself at index 0).
  const fileParents = parents.slice(1);

  // Ideally we avoid this heartbeat. Since we are not in the temporal folder.
  await heartbeat();

  // Read file content from GCS.
  let content;
  try {
    content = await gcsManager.downloadFile(gcsPath);
  } catch (e) {
    logger.warn(
      { repoId, fileName, documentId, gcsPath, err: e },
      "[Github] Error reading file from GCS"
    );
    if (e instanceof Error && "code" in e && e.code === "ENOENT") {
      return { updatedDirectoryIds: new Set() };
    }
    throw e;
  }

  const contentHash = blake3(content).toString("hex");

  // Construct source URL.
  const sourceUrl = `https://github.com/${repoLogin}/${repoName}/blob/main/${relativePath}`;

  // Find file or create it with an empty contentHash.
  const [githubCodeFile] = await GithubCodeFile.findOrCreate({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      documentId: documentId,
    },
    defaults: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      documentId: documentId,
      parentInternalId: finalParentInternalId,
      fileName: fileName,
      sourceUrl: sourceUrl,
      contentHash: "",
      createdAt: codeSyncStartedAt,
      updatedAt: codeSyncStartedAt,
      lastSeenAt: codeSyncStartedAt,
      codeUpdatedAt: codeSyncStartedAt,
    },
  });

  // If the parents have updated then the documentId gets updated as well so we should never
  // have an udpate to parentInternalId. We check that this is always the case. If the file
  // is moved (the parents change) then it will trigger the creation of a new file with a
  // new docuemntId and the existing GithubCodeFile (with old documentId) will be cleaned up
  // at the end of the activity.
  assert(
    finalParentInternalId === githubCodeFile.parentInternalId,
    `File parentInternalId mismatch for ${connector.id}/${documentId}` +
      ` (expected ${finalParentInternalId}, got ${githubCodeFile.parentInternalId})`
  );

  // Check if we need to update the file based on changes to name, URL, content or force flag.
  const needsUpdate =
    fileName !== githubCodeFile.fileName ||
    sourceUrl !== githubCodeFile.sourceUrl ||
    contentHash !== githubCodeFile.contentHash ||
    forceResync;

  const updatedDirectoryIds = new Set<string>();

  if (needsUpdate) {
    // Record the parent directories to update their updatedAt.
    for (const parentInternalId of fileParents) {
      updatedDirectoryIds.add(parentInternalId);
    }

    const renderedCode = formatCodeContentForUpsert(sourceUrl, content);

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

    const parents: [...string[], string, string] = [
      documentId,
      ...fileParents,
      rootInternalId,
      getRepositoryInternalId(repoId),
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
      parentId: parents[1],
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
