import { Request, Response } from "express";

import { RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import { ConnectorResource } from "@connectors/types/resources";

type GetConnectorPermissionsRes =
  | { resources: ConnectorResource[] }
  | ConnectorsAPIErrorResponse;

const _getConnectorPermissions = async (
  req: Request<{ connector_id: string }, GetConnectorPermissionsRes, undefined>,
  res: Response<GetConnectorPermissionsRes>
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

  const connectorPermissionRetriever =
    RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE[connector.type];

  const pRes = await connectorPermissionRetriever(connector.id);

  if (pRes.isErr()) {
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: pRes.error.message,
      },
      status_code: 500,
    });
  }

  return res.status(200).json({
    resources: pRes.value,
  });
};

export const getConnectorPermissionsAPIHandler = withLogging(
  _getConnectorPermissions
);
