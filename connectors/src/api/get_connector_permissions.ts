import type {
  ConnectorPermission,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import type { ContentNode } from "@dust-tt/types";
import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type GetConnectorPermissionsRes = WithConnectorsAPIErrorReponse<{
  resources: ContentNode[];
}>;

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

  const viewType = req.query.viewType;
  if (
    !viewType ||
    typeof viewType !== "string" ||
    (viewType !== "tables" && viewType !== "documents")
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid viewType. Required: tables | documents",
      },
    });
  }

  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }

  const pRes = await getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  }).retrievePermissions({
    parentInternalId,
    filterPermission,
    viewType,
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
