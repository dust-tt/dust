import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const notionUpdateOrphanedParents = createPlugin({
  manifest: {
    id: "notion-update-orphaned-resources-parents",
    name: "Update orphaned resources parents",
    description:
      "Update the parents of all orphaned resources of a notion connector.",
    resourceTypes: ["data_sources"],
    args: {},
  },
  isApplicableTo: (auth, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "notion";
  },
  execute: async (auth, dataSource) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (dataSource.connectorProvider !== "notion") {
      return new Err(new Error("Data source is not a notion connector."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const updateOrphanedResourcesParentsCommand: AdminCommandType = {
      majorCommand: "notion",
      command: "update-orphaned-resources-parents",
      args: {
        connectorId: connectorId.toString(),
        wId: auth.getNonNullableWorkspace().sId,
      },
    };

    const updateOrphanedResourcesParentsRes = await connectorsAPI.admin(
      updateOrphanedResourcesParentsCommand
    );
    if (updateOrphanedResourcesParentsRes.isErr()) {
      return new Err(
        new Error(updateOrphanedResourcesParentsRes.error.message)
      );
    }

    return new Ok({
      display: "text",
      value: `Workflow started for connector ${connectorId}.`,
    });
  },
});
