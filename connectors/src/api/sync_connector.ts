import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type GetSyncStatusRes = WithConnectorsAPIErrorReponse<{ workflowId: string }>;

const _syncConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, GetSyncStatusRes, undefined>,
  res: Response<GetSyncStatusRes>
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
  const launchRes = await getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  }).sync({ fromTs: null });

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

export const syncConnectorAPIHandler = withLogging(_syncConnectorAPIHandler);
