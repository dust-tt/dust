import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types";
import { CoreAPI } from "@app/types/core/core_api";

export const deleteFolderPlugin = createPlugin({
  manifest: {
    id: "delete-folder",
    name: "Delete Folder",
    warning: "This is a destructive action.",
    description:
      "Delete a specific folder from this data source by its folder ID. This will remove the folder and all its contents.",
    resourceTypes: ["data_sources"],
    args: {
      folderId: {
        type: "string",
        label: "Folder ID",
        description:
          "The ID of the folder to delete (e.g., parent_id from documents)",
      },
    },
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { folderId } = args;
    if (!folderId.trim()) {
      return new Err(new Error("Folder ID is required"));
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    const deleteRes = await coreAPI.deleteDataSourceFolder({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      folderId: folderId.trim(),
    });

    if (deleteRes.isErr()) {
      return new Err(
        new Error(`Failed to delete folder: ${deleteRes.error.message}`)
      );
    }

    return new Ok({
      display: "text",
      value: `✅ Folder ${folderId} has been successfully deleted from data source ${dataSource.sId}`,
    });
  },
});
