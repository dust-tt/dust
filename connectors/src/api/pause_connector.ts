import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

type ConnectorPauseResBody = WithConnectorsAPIErrorReponse<{
  connectorId: string;
}>;

const _pauseConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorPauseResBody>,
  res: Response<ConnectorPauseResBody>
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

    const pauseRes = await getConnectorManager({
      connectorProvider: connector.type,
      connectorId: connector.id,
    }).pause();

    if (pauseRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: pauseRes.error.message,
        },
      });
    }

    return res.sendStatus(204);
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to pause the connector");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Could not pause the connector",
      },
    });
  }
};

export const pauseConnectorAPIHandler = withLogging(_pauseConnectorAPIHandler);
