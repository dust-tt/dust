import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { makeScript } from "@app/scripts/helpers";
import { getDataSourceDocuments } from "@app/temporal/relocation/activities/source_region/core";
import { CORE_API_LIST_NODES_BATCH_SIZE } from "@app/temporal/relocation/activities/types";

makeScript(
  {
    id: {
      type: "number",
      required: true,
    },
    dataSourceId: {
      type: "string",
      description: "The data source ID (dustAPIDataSourceId)",
      required: true,
    },
    projectId: {
      type: "string",
      description: "The project ID (dustAPIProjectId)",
      required: true,
    },
    workspaceId: {
      type: "string",
      description: "The workspace ID",
      required: true,
    },
    sourceRegion: {
      type: "string",
      choices: SUPPORTED_REGIONS,
      required: true,
    },
    pageCursor: {
      type: "string",
    },
    fileName: {
      type: "string",
    },
    limit: {
      type: "number",
    },
  },
  async (
    {
      id,
      dataSourceId,
      projectId,
      workspaceId,
      sourceRegion,
      pageCursor,
      fileName,
      limit,
      execute,
    },
    logger
  ) => {
    if (!isRegionType(sourceRegion)) {
      logger.error("Invalid region.");
      return;
    }

    if (!execute) {
      logger.info("Dry run - not executing");
      return;
    }

    const result = await getDataSourceDocuments({
      dataSourceCoreIds: {
        id,
        dustAPIDataSourceId: dataSourceId,
        dustAPIProjectId: projectId,
      },
      pageCursor,
      sourceRegion,
      workspaceId,
      fileName,
      limit: limit ?? CORE_API_LIST_NODES_BATCH_SIZE,
    });

    logger.info({ result }, "Retrieved tables");
  }
);
