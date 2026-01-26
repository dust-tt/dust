import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger from "@app/logger/logger";
import type {
  IntercomCommandType,
  IntercomRestartSchedulesResponseType,
} from "@app/types";
import { ConnectorsAPI, Err, Ok } from "@app/types";

export const intercomRestartSchedulesPlugin = createPlugin({
  manifest: {
    id: "intercom-restart-schedules",
    name: "Restart Intercom Schedules",
    description:
      "Recreate the Temporal schedules for an Intercom connector. Use this when schedules are missing or corrupted.",
    resourceTypes: ["data_sources"],
    args: {
      forceDeleteExisting: {
        type: "boolean",
        label: "Force delete existing schedules",
        description:
          "If checked, existing schedules will be deleted before recreating. If unchecked, the operation will fail if schedules already exist.",
      },
    },
  },
  isApplicableTo: (auth, resource) => {
    if (!resource) {
      return false;
    }

    return resource.connectorProvider === "intercom";
  },
  execute: async (auth, resource, args) => {
    const { forceDeleteExisting } = args;

    if (!resource) {
      return new Err(new Error("Data source not found."));
    }

    if (!resource.connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const command: IntercomCommandType = {
      majorCommand: "intercom",
      command: "restart-schedules",
      args: {
        connectorId: Number(resource.connectorId),
        forceDeleteExisting: forceDeleteExisting ? "true" : undefined,
        force: undefined,
        conversationId: undefined,
        day: undefined,
        helpCenterId: undefined,
        conversationsSlidingWindow: undefined,
      },
    };

    const result = await connectorsAPI.admin(command);

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const response = result.value as IntercomRestartSchedulesResponseType;

    return new Ok({
      display: "text",
      value:
        `Successfully created Intercom schedules:\n` +
        `- Help Center: ${response.helpCenterScheduleId}\n` +
        `- Conversations: ${response.conversationScheduleId}`,
    });
  },
});
