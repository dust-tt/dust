import { garbageCollectGoogleDriveDocument } from "@app/lib/api/poke/plugins/data_sources/garbage_collect_google_drive_document";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
    },
    dsId: {
      type: "string",
      demandOption: true,
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
  async ({ execute, wId, dsId, documentIds, concurrency }, logger) => {
    let parsedDocumentIds: string[];

    try {
      parsedDocumentIds = JSON.parse(documentIds);
    } catch (e) {
      throw new Error("Invalid JSON format for documentIds parameter");
    }

    if (!Array.isArray(parsedDocumentIds)) {
      throw new Error("documentIds must be a JSON array of strings");
    }

    const auth = await Authenticator.internalAdminForWorkspace(wId);

    // Find the data source by connectorId
    const dataSource = await DataSourceResource.fetchById(auth, dsId);

    if (!dataSource) {
      throw new Error("Data source not found.");
    }

    if (dataSource.connectorProvider !== "google_drive") {
      throw new Error(
        `Not a Google Drive connector (found: ${dataSource.connectorProvider})`
      );
    }

    logger.info(
      {
        workspaceId: wId,
        dataSourceId: dataSource.sId,
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
        const result = await garbageCollectGoogleDriveDocument(dataSource, {
          documentId,
        });
        if (result.isErr()) {
          logger.info(
            { documentId, error: result.error },
            "Document could not be garbage collected."
          );
          throw result.error;
        }
      },
      { concurrency }
    );

    logger.info(
      { processedCount: parsedDocumentIds.length },
      "Garbage collection completed"
    );
  }
);
