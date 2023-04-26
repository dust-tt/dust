import { Request, Response } from "express";

import { STOP_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorDeleteReqBody = {
  dataSourceName: string;
  workspaceId: string;
};

type ConnectorDeleteResBody = { success: true } | ConnectorsAPIErrorResponse;

const _deleteConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorDeleteResBody,
    ConnectorDeleteReqBody
  >,
  res: Response<ConnectorDeleteResBody>
) => {
  try {
    if (!req.body.dataSourceName || !req.body.workspaceId) {
      // We would probably want to return the same error inteface than we use in the /front package. TBD.
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message:
            "Missing required parameters. Required : dataSourceName, workspaceId",
        },
        status_code: 400,
      });
    }

    if (!isConnectorProvider(req.params.connector_provider)) {
      return apiError(req, res, {
        api_error: {
          type: "unknown_connector_provider",
          message: `Unknown connector provider ${req.params.connector_provider}`,
        },
        status_code: 400,
      });
    }

    const connectorStopper =
      STOP_CONNECTOR_BY_TYPE[req.params.connector_provider];

    const stopRes = await connectorStopper({
      dataSourceName: req.body.dataSourceName,
      workspaceId: req.body.workspaceId,
    });

    if (stopRes.isErr()) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: stopRes.error.message,
        },
        status_code: 500,
      });
    }

    const connector = await Connector.findOne({
      where: {
        type: "notion",
        workspaceId: req.body.workspaceId,
        dataSourceName: req.body.dataSourceName,
      },
    });

    if (!connector) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: "Could not find the connector",
        },
        status_code: 500,
      });
    }

    await connector.destroy();

    return res.json({
      success: true,
    });
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to delete the connector");
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: "Could not delete the connector",
      },
      status_code: 500,
    });
  }
};

export const deleteConnectorAPIHandler = withLogging(
  _deleteConnectorAPIHandler
);
