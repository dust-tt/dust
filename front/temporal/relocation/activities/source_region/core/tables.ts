import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import type {
  CoreTableAPIRelocationBlob,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import {
  CORE_API_CONCURRENCY_LIMIT,
  CORE_API_LIST_NODES_BATCH_SIZE,
} from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";
import type {
  CoreAPINodesSearchFilter,
  CoreAPISearchCursorRequest,
  CoreAPITableBlob,
  Ok,
} from "@app/types";
import { concurrentExecutor, CoreAPI } from "@app/types";

export async function getDataSourceTables({
  dataSourceCoreIds,
  pageCursor,
  sourceRegion,
  workspaceId,
}: {
  dataSourceCoreIds: DataSourceCoreIds;
  pageCursor: string | null;
  sourceRegion: RegionType;
  workspaceId: string;
}) {
  const localLogger = logger.child({
    dataSourceCoreIds,
    sourceRegion,
  });

  localLogger.info("[Core] Retrieving data source tables");

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const filter: CoreAPINodesSearchFilter = {
    data_source_views: [
      {
        data_source_id: dataSourceCoreIds.dustAPIDataSourceId,
        // Only paginate through data source nodes.
        search_scope: "nodes_titles",
        // Leaving empty to get all tables.
        view_filter: [],
      },
    ],
    node_types: ["table"],
  };

  const options: CoreAPISearchCursorRequest = {
    limit: CORE_API_LIST_NODES_BATCH_SIZE,
  };

  if (pageCursor) {
    options.cursor = pageCursor;
  }

  // 1) List tables for the data source.
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

  const { nodes, next_page_cursor: nextPageCursor } = searchResults.value;

  // 2) Get the table blobs.
  const res = await concurrentExecutor(
    nodes,
    async (n) =>
      coreAPI.getDataSourceTableBlob({
        projectId: dataSourceCoreIds.dustAPIProjectId,
        dataSourceId: dataSourceCoreIds.dustAPIDataSourceId,
        tableId: n.node_id,
      }),
    { concurrency: CORE_API_CONCURRENCY_LIMIT }
  );

  const tableBlobs = res
    .filter((r): r is Ok<CoreAPITableBlob> => r.isOk())
    .map((r) => r.value);
  const failed = res.filter((r) => r.isErr());
  if (failed.length > 0) {
    localLogger.error(
      { failed },
      "[Core] Failed to get data source table blobs"
    );

    throw new Error("Failed to get data source table blobs");
  }

  const blobs: CoreTableAPIRelocationBlob = {
    blobs: {
      tables: tableBlobs,
    },
  };

  // 3) Save the tables blobs to file storage.
  const dataPath = await writeToRelocationStorage(blobs, {
    workspaceId,
    type: "core",
    operation: "data_source_tables_blobs",
  });

  localLogger.info(
    {
      dataPath,
      nextPageCursor,
      nodeCount: nodes.length,
    },
    "[Core] Retrieved data source tables"
  );

  return {
    dataPath,
    nextPageCursor,
  };
}
