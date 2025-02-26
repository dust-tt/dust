import { assertNever, ConnectorsAPI, Err, Ok } from "@dust-tt/types";

import config from "@app/lib/api/config";
import { createPlugin } from "@app/lib/api/poke/types";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger, { auditLog } from "@app/logger/logger";

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
        values: OPERATIONS,
      },
    },
  },
  execute: async (auth, dataSourceId, args) => {
    if (!dataSourceId) {
      return new Err(new Error("Data source not found."));
    }

    const dataSource = await DataSourceResource.fetchById(auth, dataSourceId);
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
    const res = await doOperation(op, connectorId.toString());
    if (res.isErr()) {
      return new Err(new Error(res.error.message));
    }

    return new Ok({
      display: "text",
      value: `Operation ${op} executed successfully on connector ${connectorId}.`,
    });
  },
});
