import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const notion = createPlugin({
  manifest: {
    id: "notion-unstuck-syncing-nodes",
    name: "Unstuck syncing nodes",
    description:
      "If the syncing nodes are stuck, you can use this plugin to unstuck them: it works by clearing the parentsLastUpdatedAt field, so that all parents are synced at the end of the next sync",
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

    const clearParentsLastUpdatedAtCommand: AdminCommandType = {
      majorCommand: "notion",
      command: "clear-parents-last-updated-at",
      args: {
        connectorId: connectorId.toString(),
        wId: auth.getNonNullableWorkspace().sId,
      },
    };

    const clearParentsLastUpdatedAtRes = await connectorsAPI.admin(
      clearParentsLastUpdatedAtCommand
    );
    if (clearParentsLastUpdatedAtRes.isErr()) {
      return new Err(new Error(clearParentsLastUpdatedAtRes.error.message));
    }

    return new Ok({
      display: "text",
      value: `Connector ${connectorId} unstuck.`,
    });
  },
});
