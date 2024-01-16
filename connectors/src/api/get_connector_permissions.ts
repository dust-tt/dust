import type { Request, Response } from "express";

import { RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { ConnectorsAPIErrorResponse } from "@connectors/types/errors";
import type {
  ConnectorPermission,
  ConnectorResource,
} from "@connectors/types/resources";

type GetConnectorPermissionsRes =
  | { resources: ConnectorResource[] }
  | ConnectorsAPIErrorResponse;

const _getConnectorPermissions = async (
  req: Request<{ connector_id: string }, GetConnectorPermissionsRes, undefined>,
  res: Response<GetConnectorPermissionsRes>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
    });
  }

  const parentInternalId =
    !req.query.parentId || typeof req.query.parentId !== "string"
      ? null
      : req.query.parentId;

  let filterPermission: ConnectorPermission | null = null;
  if (
    req.query.filterPermission &&
    typeof req.query.filterPermission === "string"
  ) {
    switch (req.query.filterPermission) {
      case "read":
        filterPermission = "read";
        break;
      case "write":
        filterPermission = "write";
        break;
    }
  }

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

  const connectorPermissionRetriever =
    RETRIEVE_CONNECTOR_PERMISSIONS_BY_TYPE[connector.type];

  const pRes = await connectorPermissionRetriever({
    connectorId: connector.id,
    parentInternalId,
    filterPermission,
  });

  if (pRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: pRes.error.message,
      },
    });
  }

  return res.status(200).json({
    resources: pRes.value,
  });
};

export const getConnectorPermissionsAPIHandler = withLogging(
  _getConnectorPermissions
);
