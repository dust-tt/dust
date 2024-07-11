import type { ModelId } from "@dust-tt/types";
import axios from "axios";
import mammoth from "mammoth";
import turndown from "turndown";

import { getClient } from "@connectors/connectors/microsoft";
import {
  getDriveItemAPIPath,
  getDrives,
  getFilesAndFolders,
  getItem,
  getSiteAPIPath,
  getSites,
  internalId,
  itemToMicrosoftNode,
  typeAndPathFromInternalId,
} from "@connectors/connectors/microsoft/lib/graph_api";
import type { MicrosoftNode } from "@connectors/connectors/microsoft/lib/types";
import { getMimeTypesToSync } from "@connectors/connectors/microsoft/temporal/mime_types";
import { syncSpreadSheet } from "@connectors/connectors/microsoft/temporal/spreadsheets";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
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

const FILES_SYNC_CONCURRENCY = 10;

export async function getSiteNodesToSync(
  connectorId: ModelId
): Promise<string[]> {
  const connector = await ConnectorResource.fetchById(connectorId);

  if (!connector) {
    throw new Error(`Connector with id ${connectorId} not found`);
  }

  const client = await getClient(connector.connectionId);

  const rootResources =
    await MicrosoftRootResource.listRootsByConnectorId(connectorId);

  // get root folders and drives and drill down site-root and sites to their
  // child drives (converted to MicrosoftNode types)
  const rootFolderAndDriveNodes = await Promise.all(
    rootResources
      .filter(
        (resource) =>
          resource.nodeType === "folder" || resource.nodeType === "drive"
      )
      .map(async (resource) =>
        itemToMicrosoftNode(
          resource.nodeType as "folder" | "drive",
          await getItem(client, resource.itemAPIPath)
        )
      )
  );

  const rootSitePaths: string[] = rootResources
    .filter((resource) => resource.nodeType === "site")
    .map((resource) => resource.itemAPIPath);

  if (rootResources.some((resource) => resource.nodeType === "sites-root")) {
    const msSites = await getSites(client);
    rootSitePaths.push(...msSites.map((site) => getSiteAPIPath(site)));
  }

  const siteDriveNodes = (
    await concurrentExecutor(
      rootSitePaths,
      async (sitePath) => {
        const msDrives = await getDrives(
          client,
          internalId({ nodeType: "site", itemAPIPath: sitePath })
        );
        return msDrives.map((drive) => itemToMicrosoftNode("drive", drive));
      },
      { concurrency: 5 }
    )
  ).flat();

  // remove duplicates
  const allNodes = [...siteDriveNodes, ...rootFolderAndDriveNodes].reduce(
    (acc, current) => {
      const x = acc.find((item) => item.internalId === current.internalId);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    },
    [] as MicrosoftNode[]
  );

  const nodeResources = await MicrosoftNodeResource.batchUpdateOrCreate(
    connectorId,
    allNodes
  );

  return nodeResources.map((r) => r.internalId);
}

export async function markNodeAsVisited(
  connectorId: ModelId,
  internalId: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const node = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    internalId
  );

  if (!node) {
    throw new Error(`Node ${internalId} not found`);
  }

  await node.update({ lastSeenTs: new Date() });
}

/**
 * Given a drive or folder, sync files under it and returns a list of folders to sync
 */
export async function syncFiles({
  connectorId,
  parentInternalId,
  startSyncTs,
}: {
  connectorId: ModelId;
  parentInternalId: string;
  startSyncTs: number;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector ${connectorId} not found`);
  }

  const parent = await MicrosoftNodeResource.fetchByInternalId(
    connectorId,
    parentInternalId
  );

  if (!parent) {
    throw new Error(`Unexpected: parent node not found: ${parentInternalId}`);
  }

  if (parent.nodeType !== "folder" && parent.nodeType !== "drive") {
    throw new Error(
      `Unexpected: parent node is not a folder or drive: ${parent.nodeType}`
    );
  }

  const providerConfig =
    await MicrosoftConfigurationResource.fetchByConnectorId(connectorId);

  if (!providerConfig) {
    throw new Error(`Configuration for connector ${connectorId} not found`);
  }

  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  logger.info(
    {
      connectorId,
      parent,
    },
    `[SyncFiles] Start sync`
  );
  const client = await getClient(connector.connectionId);

  // TODO(pr): handle pagination
  const children = await getFilesAndFolders(client, parent.internalId);

  const childrenToSync = children.filter(
    (item) =>
      item.file?.mimeType &&
      getMimeTypesToSync(providerConfig).includes(item.file.mimeType)
  );

  // sync files
  const results = await concurrentExecutor(
    childrenToSync,
    async (child) => {
      await syncOneFile({
        connectorId,
        dataSourceConfig,
        providerConfig,
        file: child,
        startSyncTs,
      });
    },
    { concurrency: FILES_SYNC_CONCURRENCY }
  );

  const count = results.filter((r) => r).length;

  logger.info(
    {
      connectorId,
      dataSourceName: dataSourceConfig.dataSourceName,
      parent,
      count,
    },
    `[SyncFiles] Successful sync.`
  );

  const childResources = await MicrosoftNodeResource.batchUpdateOrCreate(
    connectorId,
    children
      .filter((item) => item.folder)
      .map(
        (item): MicrosoftNode => ({
          ...itemToMicrosoftNode("folder", item),
          // add parent information to new node resources
          parentInternalId,
        })
      )
  );

  return {
    count,
    childNodes: childResources.map((r) => r.internalId),
  };
}

export async function syncOneFile({
  connectorId,
  dataSourceConfig,
  providerConfig,
  file,
  startSyncTs,
  isBatchSync = false,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  providerConfig: MicrosoftConfigurationResource;
  file: microsoftgraph.DriveItem;
  startSyncTs: number;
  isBatchSync?: boolean;
}) {
  const localLogger = logger.child({
    provider: "microsoft",
    connectorId,
    internalId: file.id,
    name: file.name,
  });

  if (!file.file) {
    throw new Error(`Item is not a file: ${JSON.stringify(file)}`);
  }

  const itemApiPath = getDriveItemAPIPath(file);

  const documentId = internalId({
    itemAPIPath: itemApiPath,
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
    pdfEnabled: providerConfig.pdfEnabled || false,
  });

  if (
    file.file?.mimeType ===
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return syncSpreadSheet({ connectorId, file });
  }
  if (!file.file?.mimeType || !mimeTypesToSync.includes(file.file.mimeType)) {
    localLogger.info("Type not supported, skipping file.");

    return false;
  }

  const maxDocumentLen = providerConfig.largeFilesEnabled
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
    connectorId,
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
