import { getConnectorManager } from "@connectors/connectors";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import type { Request, Response } from "express";

type RequestIncrementalSyncRes = WithConnectorsAPIErrorReponse<{
  workflowId: string;
}>;

const _syncConnectorIncrementalAPIHandler = async (
  req: Request<{ connector_id: string }, RequestIncrementalSyncRes, undefined>,
  res: Response<RequestIncrementalSyncRes>
) => {
  if (!req.params.connector_id) {
    res.status(400).send({
      error: {
        type: "invalid_request_error",
        message: `Missing required parameters. Required : connector_id`,
      },
    });

    return;
  }

  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    res.status(404).send({
      error: {
        type: "connector_not_found",
        message: `Connector with id ${req.params.connector_id} not found`,
      },
    });
    return;
  }

  if (connector.type !== "dust_project") {
    res.status(400).send({
      error: {
        type: "invalid_request_error",
        message: `Incremental sync on demand is only supported for dust_project connectors (got ${connector.type})`,
      },
    });
    return;
  }

  const launchRes = await getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  }).requestIncrementalSync();

  if (launchRes.isErr()) {
    res.status(500).send({
      error: {
        type: "internal_server_error",
        message: launchRes.error.message,
      },
    });
    return;
  }

  return res.status(200).send({
    workflowId: launchRes.value,
  });
};

export const syncConnectorIncrementalAPIHandler = withLogging(
  _syncConnectorIncrementalAPIHandler
);
