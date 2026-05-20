import { PROJECT_CONTEXT_FOLDER_ID } from "@connectors/connectors/dust_project/lib/constants";
import {
  handleTextExtraction,
  handleTextFile,
} from "@connectors/connectors/shared/file";
import {
  deleteDataSourceDocument,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_SMALL_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import { DustProjectMountFileResource } from "@connectors/resources/dust_project_mount_file_resource";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { isTextExtractionSupportedContentType } from "@connectors/types";
import type { ProjectMountFileEntryType } from "@dust-tt/client";
import axios, { isAxiosError } from "axios";
import { createHash } from "crypto";

export function stableMountDocumentId({
  workspaceId,
  scopedPath,
  fileId,
}: {
  workspaceId: string;
  scopedPath: string;
  fileId: string | null;
}): string {
  if (fileId) {
    return fileId;
  }
  const h = createHash("sha256")
    .update(`${workspaceId}:${scopedPath}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `dpf_${h}`;
}

async function downloadSignedFile(url: string): Promise<ArrayBuffer> {
  const res = await axios.get<ArrayBuffer>(url, {
    responseType: "arraybuffer",
    maxContentLength: MAX_FILE_SIZE_TO_DOWNLOAD,
    maxBodyLength: MAX_FILE_SIZE_TO_DOWNLOAD,
    timeout: 120_000,
  });
  return res.data;
}

async function deleteMountDocumentFromCoreBestEffort({
  dataSourceConfig,
  documentId,
  loggerArgs,
}: {
  dataSourceConfig: DataSourceConfig;
  documentId: string;
  loggerArgs: Record<string, string | number>;
}): Promise<void> {
  try {
    await deleteDataSourceDocument(dataSourceConfig, documentId, loggerArgs);
  } catch (e) {
    if (isAxiosError(e) && e.response?.status === 404) {
      return;
    }
    throw e;
  }
}

/**
 * Removes a project mount file from Core and the connector tracking table.
 */
export async function deleteProjectMountFile({
  connectorId,
  dataSourceConfig,
  projectId,
  mountRow,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  projectId: string;
  mountRow: DustProjectMountFileResource;
}): Promise<void> {
  const localLogger = logger.child({
    connectorId,
    projectId,
    scopedPath: mountRow.scopedPath,
  });
  try {
    await deleteMountDocumentFromCoreBestEffort({
      dataSourceConfig,
      documentId: mountRow.documentId,
      loggerArgs: {
        projectId,
        scopedPath: mountRow.scopedPath,
      },
    });
    await mountRow.delete();
    localLogger.info("Deleted pod mount file from data source");
  } catch (error) {
    localLogger.error({ error }, "Failed to delete pod mount file");
    throw error;
  }
}

/**
 * Downloads a project GCS mount file via signed URL, extracts content, and upserts to the
 * project data source under {@link PROJECT_CONTEXT_FOLDER_ID}.
 */
export async function syncProjectMountFile({
  connectorId,
  dataSourceConfig,
  projectId,
  workspaceId,
  entry,
  syncType,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  projectId: string;
  workspaceId: string;
  entry: ProjectMountFileEntryType;
  syncType: "batch" | "incremental";
}): Promise<void> {
  const localLogger = logger.child({
    connectorId,
    projectId,
    path: entry.path,
  });

  const signedFileUrl = entry.signedDownloadUrl;
  if (!signedFileUrl) {
    localLogger.warn(
      "Skipping mount file: missing signedDownloadUrl from project_files API"
    );
    return;
  }

  if (entry.sizeBytes > MAX_FILE_SIZE_TO_DOWNLOAD) {
    localLogger.info("Skipping mount file: exceeds max download size");
    return;
  }

  const mimeType = entry.contentType || "application/octet-stream";
  const documentId = stableMountDocumentId({
    workspaceId,
    scopedPath: entry.path,
    fileId: entry.fileId,
  });

  const sourceUpdatedAt = new Date(entry.lastModifiedMs);
  const tags = [
    `title:${entry.fileName}`,
    `project:${projectId}`,
    `mountPath:${entry.path}`,
  ];

  const existing =
    await DustProjectMountFileResource.fetchByConnectorIdAndScopedPath(
      connectorId,
      entry.path
    );

  const buffer = await downloadSignedFile(signedFileUrl);

  if (isTextExtractionSupportedContentType(mimeType)) {
    const sectionRes = await handleTextExtraction(
      buffer,
      localLogger,
      mimeType
    );
    if (sectionRes.isErr()) {
      localLogger.warn(
        { error: sectionRes.error },
        "Text extraction failed for mount file"
      );
      return;
    }
    const documentContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: entry.fileName,
      createdAt: sourceUpdatedAt,
      updatedAt: sourceUpdatedAt,
      content: sectionRes.value,
    });
    await upsertDataSourceDocument({
      dataSourceConfig,
      documentId,
      documentContent,
      documentUrl: undefined,
      timestampMs: entry.lastModifiedMs,
      tags,
      parents: [documentId, PROJECT_CONTEXT_FOLDER_ID],
      parentId: PROJECT_CONTEXT_FOLDER_ID,
      upsertContext: { sync_type: syncType },
      title: entry.fileName,
      mimeType,
      async: true,
      loggerArgs: {
        projectId,
        path: entry.path,
      },
    });
  } else if (mimeType.startsWith("text/")) {
    const textRes = handleTextFile(buffer, MAX_SMALL_DOCUMENT_TXT_LEN);
    if (textRes.isErr()) {
      localLogger.warn(
        { error: textRes.error },
        "Plain text mount file skipped"
      );
      return;
    }
    const documentContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: entry.fileName,
      createdAt: sourceUpdatedAt,
      updatedAt: sourceUpdatedAt,
      content: textRes.value,
    });
    await upsertDataSourceDocument({
      dataSourceConfig,
      documentId,
      documentContent,
      documentUrl: undefined,
      timestampMs: entry.lastModifiedMs,
      tags,
      parents: [documentId, PROJECT_CONTEXT_FOLDER_ID],
      parentId: PROJECT_CONTEXT_FOLDER_ID,
      upsertContext: { sync_type: syncType },
      title: entry.fileName,
      mimeType,
      async: true,
      loggerArgs: { projectId, path: entry.path },
    });
  } else {
    localLogger.info(
      { mimeType },
      "Skipping mount file: unsupported type for extraction"
    );
    return;
  }

  if (existing) {
    if (existing.documentId !== documentId) {
      await deleteMountDocumentFromCoreBestEffort({
        dataSourceConfig,
        documentId: existing.documentId,
        loggerArgs: { projectId, scopedPath: entry.path },
      });
    }
    const upd = await existing.updateRow({
      documentId,
      sourceUpdatedAt,
    });
    if (upd.isErr()) {
      throw upd.error;
    }
  } else {
    await DustProjectMountFileResource.makeNew({
      connectorId,
      projectId,
      scopedPath: entry.path,
      documentId,
      sourceUpdatedAt,
    });
  }

  localLogger.info({ documentId }, "Synced pod mount file");
}
