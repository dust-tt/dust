import type { Result } from "@dust-tt/types";
import { CoreAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";

export async function garbageCollectGoogleDriveDocument(
  dataSource: DataSourceResource,
  args: { documentId: string }
): Promise<Result<void, Error>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const getRes = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: args.documentId,
  });
  if (getRes.isErr()) {
    return new Err(
      new Error(`Error while getting the document: ` + getRes.error.message)
    );
  }

  const delRes = await coreAPI.deleteDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: args.documentId,
  });
  if (delRes.isErr()) {
    return new Err(
      new Error(`Error deleting document: ${delRes.error.message}`)
    );
  }

  return new Ok(undefined);
}

export const garbageCollectGoogleDriveDocumentPlugin = createPlugin({
  manifest: {
    id: "garbage-collect-google-drive-document",
    name: "GC Google Drive Document",
    description: "Garbage collect Google Drive document.",
    resourceTypes: ["data_sources"],
    args: {
      documentId: {
        type: "string",
        label: "Document ID",
        description: "Document ID to garbage collect.",
      },
    },
  },
  isVisible: async (
    auth: Authenticator,
    resourceId: string | undefined
  ): Promise<boolean> => {
    if (!resourceId) {
      return false;
    }

    const dataSource = await DataSourceResource.fetchById(auth, resourceId);
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "google_drive";
  },
  execute: async (auth, dataSourceId, args) => {
    if (!dataSourceId) {
      return new Err(new Error("Data source not found."));
    }

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "google_drive") {
      return new Err(
        new Error("This Plugin only works with Google Drive data sources.")
      );
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const { documentId } = args;

    const gcRes = await garbageCollectGoogleDriveDocument(dataSource, {
      documentId,
    });
    if (gcRes.isErr()) {
      return new Err(gcRes.error);
    }

    return new Ok({
      display: "text",
      value: `Document ${documentId} garbage collected successfully.`,
    });
  },
});
