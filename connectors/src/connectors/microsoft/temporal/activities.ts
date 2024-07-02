import type { ModelId } from "@dust-tt/types";
import fs from "fs/promises";
import os from "os";
import { uuid4 } from "@temporalio/workflow";

import { getClient } from "@connectors/connectors/microsoft";
import {
  getDriveItemApiPath,
  getFilesAndFolders,
  microsoftInternalIdFromNodeData,
} from "@connectors/connectors/microsoft/lib/graph_api";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  MicrosoftNodeResource,
  MicrosoftRootResource,
} from "@connectors/resources/microsoft_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";
import axios from "axios";
import { dpdf2text } from "@connectors/lib/dpdf2text";
import mammoth from "mammoth";
import turndown from "turndown";
import { Client } from "@microsoft/microsoft-graph-client";
import { title } from "process";

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

  const resources =
    await MicrosoftRootResource.listRootsByConnectorId(connectorId);

  const client = await getClient(connector.connectionId);

  const teamResources = resources.filter((resource) =>
    ["folder"].includes(resource.nodeType)
  );

  const folder = teamResources[0];

  if (!folder) {
    throw new Error(`No channel found for connector ${connectorId}`);
  }

  // get a message
  const filesAndFolders = await getFilesAndFolders(
    client,
    microsoftInternalIdFromNodeData(folder)
  );

  logger.info({ filesAndFolders, folder }, "Files and folders for folder");
  const file = filesAndFolders.filter((item) => item.file)[0];
  if (!file) {
    throw new Error(`No file found for folder ${folder.id}`);
  }

  syncOneFile(client, {
    file,
    parent: folder,
  });

  if (!file?.id) {
    throw new Error(`No file or no id`);
  }
}

export async function syncOneFile(
  client: Client,
  {
    file,
    parent,
  }: {
    file: microsoftgraph.DriveItem;
    parent: MicrosoftRootResource;
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

  const fileResource = await MicrosoftNodeResource.fetchByInternalId(
    microsoftInternalIdFromNodeData({
      itemApiPath,
      nodeType: "file",
    })
  );

  const res = await client
    .api(itemApiPath)
    .select("@microsoft.graph.downloadUrl")
    .get();

  const url = res["@microsoft.graph.downloadUrl"];

  logger.info({ url }, "Download URL");
  const downloadRes = await axios.get(`${url}`, {
    responseType: "arraybuffer",
  });
  logger.info({ len: downloadRes.data.length }, "File content");
  try {
    const converted = await mammoth.convertToHtml({
      buffer: Buffer.from(downloadRes.data),
    });

    const extracted = new turndown()
      .remove(["style", "script", "iframe", "noscript", "form", "img"])
      .turndown(converted.value);

    const documentContent = {
      prefix: file.name,
      content: extracted.trim(),
      sections: [],
    };

    logger.info({ documentContent }, "Document content");
  } catch (err) {
    logger.warn(
      {
        error: err,
      },
      `Error while converting docx document to text`
    );
  }
}
