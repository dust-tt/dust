import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types/connectors/admin/cli";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { Err, Ok } from "@app/types/shared/result";

export const notion = createPlugin({
  manifest: {
    id: "notion-unstuck-syncing-nodes",
    name: "Unstuck syncing nodes",
    description:
      "If the syncing nodes are stuck, you can use this plugin to unstuck them: it works by clearing the parentsLastUpdatedAt field, so that all parents are synced at the end of the next sync",
    resourceTypes: ["data_sources"],
    args: {
      resetToDate: {
        type: "date",
        label: "Reset to date (optional)",
        description:
          "If provided, sets parentsLastUpdatedAt to this date instead of null. Leave empty to reset to null (reprocess all nodes).",
      },
    },
  },
  isApplicableTo: (auth, dataSource) => {
    if (!dataSource) {
      return false;
    }

    return dataSource.connectorProvider === "notion";
  },
  execute: async (auth, dataSource, args) => {
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
        ...(args.resetToDate ? { resetToDate: args.resetToDate } : {}),
      },
    };

    const clearParentsLastUpdatedAtRes = await connectorsAPI.admin(
      clearParentsLastUpdatedAtCommand
    );
    if (clearParentsLastUpdatedAtRes.isErr()) {
      return new Err(new Error(clearParentsLastUpdatedAtRes.error.message));
    }

    const dateInfo = args.resetToDate
      ? `parentsLastUpdatedAt set to ${args.resetToDate}`
      : "parentsLastUpdatedAt cleared to null";
    return new Ok({
      display: "text",
      value: `Connector ${connectorId} unstuck (${dateInfo}).`,
    });
  },
});
