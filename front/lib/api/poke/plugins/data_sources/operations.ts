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

const OPERATIONS = [
  "PAUSE: stop all workflows for this connector",
  "UNPAUSE: restart any paused workflows",
  "SYNC: perform a full data sync for this connector",
] as const;

type OperationType = (typeof OPERATIONS)[number];

const doOperation = (op: OperationType, connectorId: string) => {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  switch (op) {
    case "PAUSE: stop all workflows for this connector":
      return connectorsAPI.pauseConnector(connectorId);
    case "UNPAUSE: restart any paused workflows":
      return connectorsAPI.unpauseConnector(connectorId);
    case "SYNC: perform a full data sync for this connector":
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
