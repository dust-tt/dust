import type { OAuth2Client } from "googleapis-common";

import { getSourceUrlForGoogleDriveFiles } from "@connectors/connectors/google_drive";
import { getFileParentsMemoized } from "@connectors/connectors/google_drive/lib/hierarchy";
import { getInternalId } from "@connectors/connectors/google_drive/temporal/utils";
import { filterCustomTags } from "@connectors/connectors/shared/tags";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  renderDocumentTitleAndContent,
  sectionLength,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import type { Logger } from "@connectors/logger/logger";
import type {
  DataSourceConfig,
  GoogleDriveObjectType,
  ModelId,
} from "@connectors/types";

export async function upsertGdriveDocument(
  dataSourceConfig: DataSourceConfig,
  file: GoogleDriveObjectType,
  documentContent: CoreAPIDataSourceDocumentSection | null,
  documentId: string,
  maxDocumentLen: number,
  localLogger: Logger,
  oauth2client: OAuth2Client,
  connectorId: ModelId,
  startSyncTs: number,
  isBatchSync: boolean
): Promise<number | undefined> {
  const content = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: file.name,
    updatedAt: file.updatedAtMs ? new Date(file.updatedAtMs) : undefined,
    createdAt: file.createdAtMs ? new Date(file.createdAtMs) : undefined,
    lastEditor: file.lastEditor ? file.lastEditor.displayName : undefined,
    content: documentContent,
    additionalPrefixes: {
      labels: file.labels.join(", "),
    },
  });

  if (documentContent === undefined) {
    localLogger.error({}, "documentContent is undefined");
    throw new Error("documentContent is undefined");
  }

  const tags = [`title:${file.name}`];
  if (file.updatedAtMs) {
    tags.push(`updatedAt:${file.updatedAtMs}`);
  }
  if (file.createdAtMs) {
    tags.push(`createdAt:${file.createdAtMs}`);
  }
  if (file.lastEditor?.displayName) {
    tags.push(`lastEditor:${file.lastEditor.displayName}`);
  }
  tags.push(`mimeType:${file.mimeType}`);

  tags.push(...filterCustomTags(file.labels, localLogger));

  const documentLen = documentContent ? sectionLength(documentContent) : 0;

  if (documentLen > 0 && documentLen <= maxDocumentLen) {
    const parentGoogleIds = await getFileParentsMemoized(
      connectorId,
      oauth2client,
      file,
      startSyncTs
    );

    const parents = parentGoogleIds.map((parent) => getInternalId(parent));

    await upsertDataSourceDocument({
      dataSourceConfig,
      documentId,
      documentContent: content,
      documentUrl: getSourceUrlForGoogleDriveFiles(file),
      timestampMs: file.updatedAtMs,
      tags,
      parents,
      parentId: parents[1] || null,
      loggerArgs: localLogger.bindings(),
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
      title: file.name,
      mimeType: file.mimeType,
      async: true,
    });
    return file.updatedAtMs;
  } else {
    localLogger.info(
      { documentLen },
      "Document is empty or too big to be upserted. Skipping"
    );
    return undefined;
  }
}
