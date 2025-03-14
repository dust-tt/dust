import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { ConnectorType, WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI } from "@app/types";

export type GetConnectorResponseBody = {
  connector: ConnectorType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetConnectorResponseBody | void>>,
  auth: Authenticator
): Promise<void> {
  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  // This endpoint can be access by non admin to get the connector chip status. Ensure that no
  // specific data other than the connection state is returned.

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource || !auth.isUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found_error",
        message: "The connector you requested was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const connectorRes = await new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      ).getConnector(dataSource.connectorId);
      if (connectorRes.isErr()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "connector_not_found_error",
            message: "The connector you requested was not found.",
          },
        });
      }

      res.status(200).json({ connector: connectorRes.value });
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

// Ensure the user is authenticated hand has at least the user role.
export default withSessionAuthenticationForWorkspace(handler);
