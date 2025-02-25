import type {
  CoreAPINodesSearchFilter,
  CoreAPISearchCursorRequest,
} from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";

import config from "@app/lib/api/config";
import type { RegionType } from "@app/lib/api/regions/config";
import logger from "@app/logger/logger";
import type {
  CoreFolderAPIRelocationBlob,
  DataSourceCoreIds,
} from "@app/temporal/relocation/activities/types";
import { CORE_API_LIST_NODES_BATCH_SIZE } from "@app/temporal/relocation/activities/types";
import { writeToRelocationStorage } from "@app/temporal/relocation/lib/file_storage/relocation";

export async function getDataSourceFolders({
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

  localLogger.info("[Core] Retrieving data source folders");

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), localLogger);

  const filter: CoreAPINodesSearchFilter = {
    data_source_views: [
      {
        data_source_id: dataSourceCoreIds.dustAPIDataSourceId,
        // Leaving empty to get all folders.
        view_filter: [],
      },
    ],
    node_types: ["Folder", "folder"],
  };

  const options: CoreAPISearchCursorRequest = {
    limit: CORE_API_LIST_NODES_BATCH_SIZE,
  };

  if (pageCursor) {
    options.cursor = pageCursor;
  }

  // 1) List folders for the data source.
  const searchResults = await coreAPI.searchNodes({
    filter,
    options,
  });

  if (searchResults.isErr()) {
    localLogger.error(
      { error: searchResults.error },
      "[Core] Failed to search nodes with cursor"
    );

    throw new Error("Failed to search nodes with cursor");
  }

  const { nodes, next_page_cursor: nextPageCursor } = searchResults.value;

  const blobs: CoreFolderAPIRelocationBlob = {
    blobs: {
      folders: nodes,
    },
  };

  // 3) Save the folders blobs to file storage.
  const dataPath = await writeToRelocationStorage(blobs, {
    workspaceId,
    type: "core",
    operation: "data_source_folders_blobs",
  });

  localLogger.info(
    {
      dataPath,
      nextPageCursor,
      nodeCount: nodes.length,
    },
    "[Core] Retrieved data source folders"
  );

  return {
    dataPath,
    nextPageCursor,
  };
}
