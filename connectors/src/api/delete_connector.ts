import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import {
  DELETE_CONNECTOR_BY_TYPE,
  STOP_CONNECTOR_BY_TYPE,
} from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { terminateAllWorkflowsForConnectorId } from "@connectors/lib/temporal";
import { apiError, withLogging } from "@connectors/logger/withlogging";

type ConnectorDeleteReqBody = {
  dataSourceName: string;
  workspaceId: string;
};

type ConnectorDeleteResBody = WithConnectorsAPIErrorReponse<{ success: true }>;

const _deleteConnectorAPIHandler = async (
  req: Request<
    { connector_id: string },
    ConnectorDeleteResBody,
    ConnectorDeleteReqBody
  >,
  res: Response<ConnectorDeleteResBody>
) => {
  const force = req.query.force === "true";
  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }

  const connectorStopper = STOP_CONNECTOR_BY_TYPE[connector.type];

  const stopRes = await connectorStopper(connector.id.toString());

  if (stopRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: stopRes.error.message,
      },
    });
  }

  if (!connector) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Could not find the connector",
      },
    });
  }

  const connectorDeleter = DELETE_CONNECTOR_BY_TYPE[connector.type];
  const cleanRes = await connectorDeleter(connector.id.toString(), force);
  if (cleanRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: cleanRes.error.message,
      },
    });
  }
  await terminateAllWorkflowsForConnectorId(connector.id);
  return res.json({
    success: true,
  });
};

export const deleteConnectorAPIHandler = withLogging(
  _deleteConnectorAPIHandler
);
