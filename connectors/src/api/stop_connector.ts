import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type ConnectorStopResBody = WithConnectorsAPIErrorReponse<{
  connectorId: string;
}>;

const _stopConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorStopResBody>,
  res: Response<ConnectorStopResBody>
) => {
  try {
    const connector = await ConnectorResource.fetchById(
      req.params.connector_id
    );
    if (!connector) {
      return apiError(req, res, {
        api_error: {
          type: "connector_not_found",
          message: "Connector not found",
        },
        status_code: 404,
      });
    }

    const stopRes = await getConnectorManager({
      connectorProvider: connector.type,
      connectorId: connector.id,
    }).stop();

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
