import type { ModelId } from "@dust-tt/types";
import type { Client } from "@microsoft/microsoft-graph-client";
import axios from "axios";
import mammoth from "mammoth";
import turndown from "turndown";

import { getClient } from "@connectors/connectors/microsoft";
import {
  getDriveItemApiPath,
  getFilesAndFolders,
  microsoftInternalIdFromNodeData,
} from "@connectors/connectors/microsoft/lib/graph_api";
import { getMimeTypesToSync } from "@connectors/connectors/microsoft/temporal/mime_types";
import { syncSpreadSheet } from "@connectors/connectors/microsoft/temporal/spreadsheets";
import {
  MAX_DOCUMENT_TXT_LEN,
  MAX_FILE_SIZE_TO_DOWNLOAD,
  MAX_LARGE_DOCUMENT_TXT_LEN,
  renderDocumentTitleAndContent,
  sectionLength,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import type { MicrosoftNodeModel } from "@connectors/lib/models/microsoft";
import logger from "@connectors/logger/logger";
import type { WithCreationAttributes } from "@connectors/resources/connector/strategy";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  MicrosoftConfigurationResource,
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function fullSyncActivity({
  connectorId,
  dataSourceConfig,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
}): Promise<void> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const config =
    await MicrosoftConfigurationResource.fetchByConnectorId(connectorId);
  if (!config) {
    throw new Error(`Configuration for connector ${connectorId} not found`);
  }

  const resources =
    await MicrosoftRootResource.listRootsByConnectorId(connectorId);

  const client = await getClient(connector.connectionId);

  const folderResources = resources.filter((resource) =>
    ["folder"].includes(resource.nodeType)
  );

  const folder = folderResources[0];

  if (!folder) {
    throw new Error(`No channel found for connector ${connectorId}`);
  }

  const filesAndFolders = await getFilesAndFolders(
    client,
    microsoftInternalIdFromNodeData(folder)
  );

  logger.info({ filesAndFolders, folder }, "Files and folders for folder");
  const file = filesAndFolders.filter((item) => item.file)[0];
  if (!file) {
    throw new Error(`No file found for folder ${folder.id}`);
  }

  const startSyncTs = Date.now();

  await syncOneFile(client, {
    connectorId,
    dataSourceConfig,
    file,
    parent: folder,
    config,
    startSyncTs,
  });

  if (!file?.id) {
    throw new Error(`No file or no id`);
  }
}

export async function syncOneFile(
  client: Client,
  {
    connectorId,
    dataSourceConfig,
    file,
    parent,
    startSyncTs,
    config,
    isBatchSync = false,
  }: {
    connectorId: ModelId;
    dataSourceConfig: DataSourceConfig;
    file: microsoftgraph.DriveItem;
    parent: MicrosoftRootResource;
    startSyncTs: number;
    config?: MicrosoftConfigurationResource;
    isBatchSync?: boolean;
  }
) {
  const localLogger = logger.child({
    provider: "microsoft",
    connectorId: parent.connectorId,
    internalId: file.id,
    name: file.name,
  });

  if (!file.file) {
    throw new Error(`Item is not a file: ${JSON.stringify(file)}`);
  }

  const itemApiPath = getDriveItemApiPath(
    file,
    microsoftInternalIdFromNodeData(parent)
  );

  const documentId = microsoftInternalIdFromNodeData({
    itemApiPath,
    nodeType: "file",
  });

  const fileResource = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    documentId
  );

  // Early return if lastSeenTs is greater than workflow start.
  // This allows avoiding resyncing already-synced documents in case of activity failure
  if (
    fileResource?.lastSeenTs &&
    fileResource.lastSeenTs > new Date(startSyncTs)
  ) {
    return true;
  }

  if (fileResource?.skipReason) {
    localLogger.info(
      { skipReason: fileResource.skipReason },
      "Skipping file sync"
    );
    return false;
  }

  const url =
    "@microsoft.graph.downloadUrl" in file
      ? file["@microsoft.graph.downloadUrl"]
      : null;

  if (!url) {
    localLogger.error("Unexpected missing download URL");
    throw new Error("Unexpected missing download URL");
  }

  if (!url) {
    localLogger.info("No download URL found");
    return false;
  }

  // If the file is too big to be downloaded, we skip it.
  if (file.size && file.size > MAX_FILE_SIZE_TO_DOWNLOAD) {
    localLogger.info("File size exceeded, skipping file.");

    return false;
  }

  const mimeTypesToSync = getMimeTypesToSync({
    pdfEnabled: config?.pdfEnabled || false,
  });

  if (
    file.file?.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return syncSpreadSheet(client, { file, parent });
  }
  if (!file.file?.mimeType || !mimeTypesToSync.includes(file.file.mimeType)) {
    localLogger.info("Type not supported, skipping file.");

    return false;
  }

  const maxDocumentLen = config?.largeFilesEnabled
    ? MAX_LARGE_DOCUMENT_TXT_LEN
    : MAX_DOCUMENT_TXT_LEN;

  const downloadRes = await axios.get(`${url}`, {
    responseType: "arraybuffer",
  });

  if (downloadRes.status !== 200) {
    localLogger.error(
      `Error while downloading file ${file.name}: ${downloadRes.status}`
    );
    throw new Error(
      `Error while downloading file ${file.name}: ${downloadRes.status}`
    );
  }

  async function getDocumentContent() {
    try {
      const converted = await mammoth.convertToHtml({
        buffer: Buffer.from(downloadRes.data),
      });

      const extracted = new turndown()
        .remove(["style", "script", "iframe", "noscript", "form", "img"])
        .turndown(converted.value);

      return extracted.trim();
    } catch (err) {
      localLogger.error(
        {
          error: err,
        },
        `Error while converting docx document to text`
      );
      throw err;
    }
  }

  const documentContent = await getDocumentContent();

  logger.info({ documentContent }, "Document content");

  const documentSection = {
    prefix: null,
    content: documentContent,
    sections: [],
  };

  const updatedAt = file.lastModifiedDateTime
    ? new Date(file.lastModifiedDateTime)
    : undefined;

  const createdAt = file.createdDateTime
    ? new Date(file.createdDateTime)
    : undefined;

  const content = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: file.name ?? null,
    updatedAt,
    createdAt,
    lastEditor: file.lastModifiedBy?.user
      ? file.lastModifiedBy.user.displayName ?? undefined
      : undefined,
    content: documentSection,
  });

  if (documentSection === undefined) {
    localLogger.error({}, "documentContent is undefined");
    throw new Error("documentContent is undefined");
  }

  const tags = [`title:${file.name}`];

  if (file.lastModifiedDateTime) {
    tags.push(`updatedAt:${file.lastModifiedDateTime}`);
  }

  if (file.createdDateTime) {
    tags.push(`createdAt:${file.createdDateTime}`);
  }

  if (file.lastModifiedBy?.user?.displayName) {
    tags.push(`lastEditor:${file.lastModifiedBy.user.displayName}`);
  }

  tags.push(`mimeType:${file.file.mimeType}`);

  const documentLength = documentSection ? sectionLength(documentSection) : 0;

  const upsertTimestampMs = updatedAt ? updatedAt.getTime() : undefined;

  const isInSizeRange = documentLength > 0 && documentLength < maxDocumentLen;
  if (isInSizeRange) {
    // TODO(pr): add getParents implementation
    const parents = [];
    parents.push(documentId);
    parents.reverse();

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent: content,
      documentUrl: file.webUrl ?? undefined,
      timestampMs: upsertTimestampMs,
      tags,
      parents: parents,
      upsertContext: {
        sync_type: isBatchSync ? "batch" : "incremental",
      },
      async: true,
    });
  } else {
    localLogger.info(
      {
        documentLen: documentLength,
      },
      `Document is empty or too big to be upserted (marking as synced without upserting)`
    );
  }

  const resourceBlob: WithCreationAttributes<MicrosoftNodeModel> = {
    internalId: documentId,
    connectorId: connectorId,
    lastSeenTs: new Date(),
    nodeType: "file",
    name: file.name ?? "",
    mimeType: file.file.mimeType ?? "",
    lastUpsertedTs:
      isInSizeRange && upsertTimestampMs ? new Date(upsertTimestampMs) : null,
  };

  if (fileResource) {
    await fileResource.update(resourceBlob);
  } else {
    await MicrosoftNodeResource.makeNew(resourceBlob);
  }

  return isInSizeRange;
}
