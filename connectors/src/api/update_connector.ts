import { Request, Response } from "express";

import { UPDATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorUpdateReqBody = {
  connectionId?: string | null;
  defaultNewResourcePermission?: string | null;
};
type ConnectorUpdateResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _getConnectorUpdateAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorUpdateReqBody>,
  res: Response<ConnectorUpdateResBody>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }

  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }

  const connectorUpdater = UPDATE_CONNECTOR_BY_TYPE[connector.type];

  const updateRes = await connectorUpdater(connector.id, {
    connectionId: req.body.connectionId,
    defaultNewResourcePermission: req.body.defaultNewResourcePermission,
  });

  if (updateRes.isErr()) {
    const errorRes = updateRes as { error: ConnectorsAPIErrorResponse };
    const error = errorRes.error.error;

    if (error.type === "connector_oauth_target_mismatch") {
      return apiError(req, res, {
        api_error: {
          type: error.type,
          message: error.message,
        },
        status_code: 401,
      });
    } else {
      return apiError(req, res, {
        api_error: {
          type: "connector_update_error",
          message: `Could not update the connector: ${error.message}`,
        },
        status_code: 500,
      });
    }
  }

  return res.status(200).json({
    connectorId: updateRes.value,
  });
};

export const getConnectorUpdateAPIHandler = withLogging(
  _getConnectorUpdateAPIHandler
);
