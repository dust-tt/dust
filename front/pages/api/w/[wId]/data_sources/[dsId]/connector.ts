import type { ConnectorType, WithAPIErrorResponse } from "@dust-tt/types";
import { ConnectorsAPI } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

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
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }
  const dataSource = await DataSourceResource.fetchByNameOrId(
    auth,
    dsId,
    // TODO(DATASOURCE_SID): Clean-up
    { origin: "data_source_configuration" }
  );
  if (!dataSource) {
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

export default withSessionAuthenticationForWorkspace(handler);
