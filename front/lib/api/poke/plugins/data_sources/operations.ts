import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import logger, { auditLog } from "@app/logger/logger";
import {
  assertNever,
  ConnectorsAPI,
  Err,
  mapToEnumValues,
  Ok,
} from "@app/types";

const OPERATIONS = ["STOP", "PAUSE", "UNPAUSE", "RESUME", "SYNC"] as const;

type OperationType = (typeof OPERATIONS)[number];

const doOperation = (op: OperationType, connectorId: string) => {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  switch (op) {
    case "STOP":
      return connectorsAPI.stopConnector(connectorId);
    case "PAUSE":
      return connectorsAPI.pauseConnector(connectorId);
    case "UNPAUSE":
      return connectorsAPI.unpauseConnector(connectorId);
    case "RESUME":
      return connectorsAPI.resumeConnector(connectorId);
    case "SYNC":
      return connectorsAPI.syncConnector(connectorId);
    default:
      assertNever(op);
  }
};

export const connectorOperationsPlugin = createPlugin({
  manifest: {
    id: "maintenance-operation",
    name: "Maintenance operation",
    description: "Execute a maintenance operation on connector",
    resourceTypes: ["data_sources"],
    args: {
      op: {
        type: "enum",
        label: "Operation",
        description: "Select operation to execute",
        values: mapToEnumValues(OPERATIONS, (op) => ({
          label: op,
          value: op,
        })),
        multiple: false,
      },
    },
  },
  execute: async (auth, dataSource, args) => {
    if (!dataSource) {
      return new Err(new Error("Data source not found."));
    }

    const { connectorId } = dataSource;
    if (!connectorId) {
      return new Err(new Error("No connector on datasource."));
    }

    const { op } = args;

    auditLog(
      {
        connectorId,
        op,
        who: auth.user(),
      },
      "Executing operation on connector"
    );
    const res = await doOperation(
      op[0] as OperationType,
      connectorId.toString()
    );
    if (res.isErr()) {
      return new Err(new Error(res.error.message));
    }

    return new Ok({
      display: "text",
      value: `Operation ${op} executed successfully on connector ${connectorId}.`,
    });
  },
});
