import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import type { AdminCommandType } from "@app/types";
import {
  CONNECTORS_ERROR_TYPES,
  ConnectorsAPI,
  Err,
  mapToEnumValues,
  Ok,
} from "@app/types";

export const markConnectorAsErrorPlugin = createPlugin({
  manifest: {
    id: "mark-connector-as-error",
    name: "Mark connector as errored",
    description: "Mark a connector as errored with a specific error type",
    resourceTypes: ["data_sources"],
    args: {
      errorType: {
        type: "enum",
        label: "Error Type",
        description: "Select error type to set",
        values: mapToEnumValues(CONNECTORS_ERROR_TYPES, (errorType) => ({
          label: errorType,
          value: errorType,
        })),
        multiple: false,
      },
    },
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    if (!isManaged(dataSource) && !isWebsite(dataSource)) {
      return new Err(new Error("Data source is not managed or website."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const { errorType } = args;
    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    // First set the error.
    const setErrorCommand: AdminCommandType = {
      majorCommand: "connectors",
      command: "set-error",
      args: {
        connectorId: connectorId.toString(),
        error: errorType[0],
        wId: auth.getNonNullableWorkspace().sId,
        dsId: dataSource.sId,
      },
    };

    const setErrorRes = await connectorsAPI.admin(setErrorCommand);
    if (setErrorRes.isErr()) {
      return new Err(new Error(setErrorRes.error.message));
    }

    // Then pause it.
    const pauseRes = await connectorsAPI.pauseConnector(connectorId.toString());
    if (pauseRes.isErr()) {
      return new Err(new Error(pauseRes.error.message));
    }

    return new Ok({
      display: "text",
      value: `Connector ${connectorId} marked as ${errorType} and paused.`,
    });
  },
});
