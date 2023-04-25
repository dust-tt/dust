import { Request, Response } from "express";

import { STOP_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorStopReqBody = {
  dataSourceName: string;
  workspaceId: string;
};

type ConnectorStopResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _stopConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorStopResBody,
    ConnectorStopReqBody
  >,
  res: Response<ConnectorStopResBody>
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

    return res.status(200).json({
      connectorId: stopRes.value,
    });
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to stop the connector");
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: "Could not stop the connector",
      },
      status_code: 500,
    });
  }
};

export const stopConnectorAPIHandler = withLogging(_stopConnectorAPIHandler);
