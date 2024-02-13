import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";

import { RESUME_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

type ConnectorResumeResBody = WithConnectorsAPIErrorReponse<{
  connectorId: string;
}>;

const _resumeConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorResumeResBody>,
  res: Response<ConnectorResumeResBody>
) => {
  try {
    const connector = await ConnectorModel.findByPk(req.params.connector_id);
    if (!connector) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "connector_not_found",
          message: "Connector not found",
        },
      });
    }
    const connectorResumer = RESUME_CONNECTOR_BY_TYPE[connector.type];

    const resumeRes = await connectorResumer(connector.id);

    if (resumeRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Could not resume the connector",
        },
      });
    }

    return res.sendStatus(204);
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to resume the connector");
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Could not resume the connector",
      },
    });
  }
};

export const resumeConnectorAPIHandler = withLogging(
  _resumeConnectorAPIHandler
);
