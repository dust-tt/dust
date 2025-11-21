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
  "STOP: stop workflows with intent to resume shortly after (no DB changes)",
  "RESUME: start all stopped workflows",
  "PAUSE: stop workflows for a longer period of time (marks Connectors DB)",
  "UNPAUSE: use to undo PAUSE (marks Connectors DB)",
  "SYNC: use to synchronize workflows (heavyweight, use sparingly!)",
] as const;

type OperationType = (typeof OPERATIONS)[number];

const doOperation = (op: OperationType, connectorId: string) => {
  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );

  switch (op) {
    case "STOP: stop workflows with intent to resume shortly after (no DB changes)":
      return connectorsAPI.stopConnector(connectorId);
    case "PAUSE: stop workflows for a longer period of time (marks Connectors DB)":
      return connectorsAPI.pauseConnector(connectorId);
    case "UNPAUSE: use to undo PAUSE (marks Connectors DB)":
      return connectorsAPI.unpauseConnector(connectorId);
    case "RESUME: start all stopped workflows":
      return connectorsAPI.resumeConnector(connectorId);
    case "SYNC: use to synchronize workflows (heavyweight, use sparingly!)":
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
