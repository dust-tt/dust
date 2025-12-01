import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { Err, Ok, pluralize } from "@app/types";
import { CoreAPI } from "@app/types";

export const removeOldDocumentsPlugin = createPlugin({
  manifest: {
    id: "remove-old-documents",
    name: "Remove Old Documents",
    warning: "This is a destructive action.",
    description:
      "Remove all documents from this data source that are older than the specified date. " +
      "Documents are compared by their timestamp field. This action cannot be undone.",
    resourceTypes: ["data_sources"],
    args: {
      cutoffDate: {
        type: "string",
        label: "Cutoff Date (YYYY-MM-DD)",
        description:
          "Remove all documents with a timestamp older than this date (00:00:00 UTC - exclusive). Format: YYYY-MM-DD",
      },
      execute: {
        type: "boolean",
        label: "Execute",
        description:
          "If disabled, will only show what documents would be deleted without actually deleting them",
      },
    },
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    // Prevent deletion from managed data sources
    if (dataSource.connectorId) {
      return new Err(
        new Error(
          "Cannot delete documents from a managed data source. This plugin only works with unmanaged data sources."
        )
      );
    }

    const { cutoffDate, execute } = args;

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(cutoffDate)) {
      return new Err(
        new Error("Invalid date format. Use YYYY-MM-DD (e.g., 2024-01-15)")
      );
    }

    // Parse the cutoff date (start of day in UTC)
    const cutoffDateTime = new Date(cutoffDate + "T00:00:00Z");
    if (isNaN(cutoffDateTime.getTime())) {
      return new Err(new Error("Invalid date"));
    }

    const cutoffTimestamp = cutoffDateTime.getTime();

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    // Collect all documents older than the cutoff date
    const documentsToDelete: Array<{
      documentId: string;
      timestamp: number;
      title: string | null;
    }> = [];

    let offset = 0;
    const limit = 100; // Process in batches
    let hasMore = true;

    while (hasMore) {
      const documentsRes = await coreAPI.getDataSourceDocuments(
        {
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
        },
        { limit, offset }
      );

      if (documentsRes.isErr()) {
        return new Err(
          new Error(`Failed to fetch documents: ${documentsRes.error.message}`)
        );
      }

      const { documents, total } = documentsRes.value;

      // Filter documents older than cutoff date
      for (const doc of documents) {
        // Use timestamp field (or created as fallback)
        const docTimestamp = doc.timestamp || doc.created;
        if (docTimestamp < cutoffTimestamp) {
          documentsToDelete.push({
            documentId: doc.document_id,
            timestamp: docTimestamp,
            title: doc.title,
          });
        }
      }

      offset += documents.length;
      hasMore = offset < total;
    }

    if (documentsToDelete.length === 0) {
      return new Ok({
        display: "text",
        value: `No documents found older than ${cutoffDate}.`,
      });
    }

    if (!execute) {
      return new Ok({
        display: "json",
        value: {
          mode: "dry_run",
          message: `Found ${documentsToDelete.length} document${pluralize(documentsToDelete.length)} older than ${cutoffDate} that would be deleted`,
          cutoffDate,
          cutoffTimestamp,
          documents: documentsToDelete.slice(0, 100).map((doc) => ({
            documentId: doc.documentId,
            title: doc.title,
            timestamp: doc.timestamp,
            date: new Date(doc.timestamp).toISOString().split("T")[0],
          })),
          totalCount: documentsToDelete.length,
          note:
            documentsToDelete.length > 100
              ? `Showing first 100 of ${documentsToDelete.length} documents. Tick 'execute' to perform the deletion.`
              : "No documents were actually deleted. Tick 'execute' to perform the deletion.",
        },
      });
    }

    // Actually delete the documents
    const deleteResults = await concurrentExecutor(
      documentsToDelete,
      async ({ documentId }) => {
        const delRes = await coreAPI.deleteDataSourceDocument({
          projectId: dataSource.dustAPIProjectId,
          dataSourceId: dataSource.dustAPIDataSourceId,
          documentId,
        });

        if (delRes.isErr()) {
          return {
            documentId,
            success: false,
            error: delRes.error.message,
          };
        }

        return {
          documentId,
          success: true,
        };
      },
      { concurrency: 10 }
    );

    const successCount = deleteResults.filter((r) => r.success).length;
    const failureCount = deleteResults.filter((r) => !r.success).length;
    const failures = deleteResults
      .filter((r) => !r.success)
      .map((r) => `${r.documentId}: ${r.error}`)
      .slice(0, 10);

    return new Ok({
      display: "json",
      value: {
        mode: "execution",
        message: `Deletion completed: ${successCount} document${pluralize(successCount)} deleted, ${failureCount} failure${pluralize(failureCount)}`,
        cutoffDate,
        summary: {
          total: documentsToDelete.length,
          successful: successCount,
          failed: failureCount,
        },
        ...(failures.length > 0 && {
          failures: failures,
          note:
            failures.length < failureCount
              ? `Showing first ${failures.length} of ${failureCount} failures.`
              : undefined,
        }),
      },
    });
  },
});
