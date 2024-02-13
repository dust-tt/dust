import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import { STOP_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

type ConnectorStopResBody = WithConnectorsAPIErrorReponse<{
  connectorId: string;
}>;

const _stopConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorStopResBody>,
  res: Response<ConnectorStopResBody>
) => {
  try {
    const connector = await ConnectorModel.findByPk(req.params.connector_id);
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

    const stopRes = await connectorStopper(connector.id);

    if (stopRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: stopRes.error.message,
        },
      });
    }

    return res.sendStatus(204);
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to stop the connector");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Could not stop the connector",
      },
    });
  }
};

export const stopConnectorAPIHandler = withLogging(_stopConnectorAPIHandler);
