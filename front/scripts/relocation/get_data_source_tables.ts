import { isRegionType, SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { makeScript } from "@app/scripts/helpers";
import { getDataSourceTables } from "@app/temporal/relocation/activities/source_region/core/tables";

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
  },
  async (
    {
      id,
      dataSourceId,
      projectId,
      workspaceId,
      sourceRegion,
      pageCursor,
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

    const result = await getDataSourceTables({
      dataSourceCoreIds: {
        id,
        dustAPIDataSourceId: dataSourceId,
        dustAPIProjectId: projectId,
      },
      pageCursor,
      sourceRegion,
      workspaceId,
    });

    logger.info({ result }, "Retrieved tables");
  }
);
