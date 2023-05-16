import { Request, Response } from "express";

import { STOP_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorStopResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _stopConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorStopResBody>,
  res: Response<ConnectorStopResBody>
) => {
  try {
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
    const connectorStopper = STOP_CONNECTOR_BY_TYPE[connector.type];

    const stopRes = await connectorStopper(connector.id.toString());

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
