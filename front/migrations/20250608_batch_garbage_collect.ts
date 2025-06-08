import config from "@app/lib/api/config";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { CoreAPI } from "@app/types";

async function garbageCollectGoogleDriveDocument(
  dataSource: { dustAPIProjectId: string; dustAPIDataSourceId: string },
  documentId: string,
  childLogger: typeof logger
): Promise<void> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), childLogger);

  const getRes = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: documentId,
  });

  if (getRes.isErr()) {
    throw new Error(
      `Error while getting document ${documentId}: ${getRes.error.message}`
    );
  }

  const delRes = await coreAPI.deleteDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: documentId,
  });

  if (delRes.isErr()) {
    throw new Error(
      `Error deleting document ${documentId}: ${delRes.error.message}`
    );
  }

  childLogger.info({ documentId }, "Document garbage collected successfully");
}

makeScript(
  {
    connectorId: {
      type: "string",
      demandOption: true,
      description:
        "Connector ID to find the associated Google Drive data source",
    },
    documentIds: {
      type: "string",
      demandOption: true,
      description:
        'JSON array of document IDs to garbage collect (e.g. \'["doc1", "doc2"]\')',
    },
    concurrency: {
      type: "number",
      default: 10,
      description: "Number of documents to process concurrently",
    },
  },
  async ({ execute, connectorId, documentIds, concurrency }, logger) => {
    let parsedDocumentIds: string[];

    try {
      parsedDocumentIds = JSON.parse(documentIds);
    } catch (e) {
      throw new Error("Invalid JSON format for documentIds parameter");
    }

    if (!Array.isArray(parsedDocumentIds)) {
      throw new Error("documentIds must be a JSON array of strings");
    }

    // Find the data source by connectorId
    const dataSource = await DataSourceModel.findOne({
      where: {
        connectorId: connectorId,
      },
    });

    if (!dataSource) {
      throw new Error(`Data source not found for connector ID ${connectorId}`);
    }

    if (dataSource.connectorProvider !== "google_drive") {
      throw new Error(
        `Connector ${connectorId} is not a Google Drive connector (found: ${dataSource.connectorProvider})`
      );
    }

    logger.info(
      {
        connectorId,
        dataSourceId: dataSource.id,
        dataSourceName: dataSource.name,
        documentCount: parsedDocumentIds.length,
        execute,
      },
      "Starting Google Drive documents garbage collection"
    );

    if (!execute) {
      logger.info("DRY RUN - would garbage collect the following documents:");
      parsedDocumentIds.forEach((docId) => {
        logger.info({ documentId: docId }, "Would garbage collect document");
      });
      return;
    }

    await concurrentExecutor(
      parsedDocumentIds,
      async (documentId) => {
        const childLogger = logger.child({ documentId, connectorId });
        await garbageCollectGoogleDriveDocument(
          {
            dustAPIProjectId: dataSource.dustAPIProjectId,
            dustAPIDataSourceId: dataSource.dustAPIDataSourceId,
          },
          documentId,
          childLogger
        );
      },
      { concurrency }
    );

    logger.info(
      { processedCount: parsedDocumentIds.length },
      "Garbage collection completed"
    );
  }
);
