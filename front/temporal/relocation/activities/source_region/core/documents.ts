import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  CoreDocumentAPIRelocationBlob,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import { CORE_API_CONCURRENCY_LIMIT } from "@app/temporal/relocation/activities/types";
import {
  withJSONSerializationRetry,
  writeToRelocationStorage,
} from "@app/temporal/relocation/lib/file_storage/relocation";
import type {
  CoreAPIDocumentBlob,
  CoreAPINodesSearchFilter,
  CoreAPISearchCursorRequest,
  Ok,
} from "@app/types";
import { CoreAPI } from "@app/types";

export async function getDataSourceDocuments({
  dataSourceCoreIds,
  pageCursor,
  sourceRegion,
  workspaceId,
  fileName,
  limit,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
  sourceRegion: RegionType;
  workspaceId: string;
  fileName?: string;
  limit: number;
}) {
  const localLogger = logger.child({
    dataSourceCoreIds,
    sourceRegion,
  });

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const filter: CoreAPINodesSearchFilter = {
    data_source_views: [
      {
        data_source_id: dataSourceCoreIds.dustAPIDataSourceId,
        // Only paginate through data source nodes.
        search_scope: "nodes_titles",
        // Leaving empty to get all documents.
        view_filter: [],
      },
    ],
    node_types: ["document"],
  };

  const options: CoreAPISearchCursorRequest = {
    limit,
  };

  if (pageCursor) {
    options.cursor = pageCursor;
  }

  // 1) List documents for the data source.
  const searchResults = await coreAPI.searchNodes({
    filter,
    options,
  });

  if (searchResults.isErr()) {
    localLogger.error(
      { cursor: pageCursor, error: searchResults.error },
      "[Core] Failed to search nodes with cursor"
    );

    throw new Error("Failed to search nodes with cursor");
  }

  const {
    nodes,
    next_page_cursor: nextPageCursor,
    hit_count: totalNodeCount,
  } = searchResults.value;

  // 2) Get the document blobs.
  const res = await concurrentExecutor(
    nodes,
    async (n) =>
      coreAPI.getDataSourceDocumentBlob({
        projectId: dataSourceCoreIds.dustAPIProjectId,
        dataSourceId: dataSourceCoreIds.dustAPIDataSourceId,
        documentId: n.node_id,
      }),
    { concurrency: CORE_API_CONCURRENCY_LIMIT }
  );

  const documentBlobs = res
    .filter((r): r is Ok<CoreAPIDocumentBlob> => r.isOk())
    .map((r) => r.value);
  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    localLogger.error(
      { count: failed.length, failed },
      "[Core] Failed to get data source document blobs"
    );

    // We have two cases of failures here:
    // - The document is not found in SQL. That means we have a discrepancy between ES and SQL. It
    // means the document was removed and we should just skip it.
    // - The document is found in SQL but the blob is not found. We temporarily ignore this error.

    // Filter out the errors.
    const unknownFailures = failed.filter(
      (r) =>
        r.isErr() &&
        r.error.code !== "data_source_document_not_found" &&
        !r.error.message.includes("Failed to retrieve document blob")
    );

    // Explicitly fail if there are any other errors.
    if (unknownFailures.length > 0) {
      throw new Error("Failed to get data source document blobs");
    }
  }

  const blobs: CoreDocumentAPIRelocationBlob = {
    blobs: {
      documents: documentBlobs,
    },
  };

  return withJSONSerializationRetry<{
    dataPath: string | null;
    nextPageCursor: string | null;
    nextLimit: number | null;
  }>(
    async () => {
      const dataPath = await writeToRelocationStorage(blobs, {
        workspaceId,
        type: "core",
        operation: "data_source_documents_blobs",
        fileName,
      });

      localLogger.info(
        {
          dataPath,
          nextPageCursor,
          nodeCount: nodes.length,
          totalNodeCount,
        },
        "[Core] Retrieved data source documents"
      );

      return {
        dataPath,
        nextPageCursor,
        nextLimit: null,
      };
    },
    {
      fallbackResult: {
        dataPath: null,
        nextPageCursor: pageCursor,
      },
      limit,
      localLogger,
    }
  );
}

export async function getRegionDustFacingUrl() {
  return config.getClientFacingUrl();
}
