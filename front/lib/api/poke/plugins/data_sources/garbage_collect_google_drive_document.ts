import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { CoreAPI, Err, Ok } from "@app/types";

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
    description:
      "Garbage collect Google Drive document(s). Accepts a single ID or a comma-separated list.",
    resourceTypes: ["data_sources"],
    args: {
      documentId: {
        type: "string",
        label: "Document ID(s)",
        description:
          "Document ID to garbage collect, or a comma-separated list. e.g. gdrive-1sz1eozmkoydwK63KkO4MMmXKuzqtYrHF or gdrive-abc, gdrive-def",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.connectorProvider === "google_drive";
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const rawDocumentIds = args.documentId.trim();
    if (!rawDocumentIds) {
      return new Err(new Error("documentId is required"));
    }

    const documentIds = rawDocumentIds
      .split(",")
      .map((d) => d.trim())
      .filter((d) => d.length > 0);

    const failures: { id: string; error: string }[] = [];
    let successCount = 0;

    for (const id of documentIds) {
      const gcRes = await garbageCollectGoogleDriveDocument(dataSource, {
        documentId: id,
      });
      if (gcRes.isErr()) {
        failures.push({ id, error: gcRes.error.message });
      } else {
        successCount += 1;
      }
    }

    if (failures.length > 0) {
      const failedList = failures.map((f) => `${f.id}: ${f.error}`).join("; ");
      return new Err(
        new Error(
          `Garbage collection failed for ${failures.length}/${documentIds.length} document(s): ${failedList}`
        )
      );
    }

    return new Ok({
      display: "text",
      value: `Garbage collected ${successCount} document(s).`,
    });
  },
});
