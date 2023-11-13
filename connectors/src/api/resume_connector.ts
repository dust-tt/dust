import { Request, Response } from "express";

import { RESUME_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorResumeResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _resumeConnectorAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorResumeResBody>,
  res: Response<ConnectorResumeResBody>
) => {
  try {
    const connector = await Connector.findByPk(req.params.connector_id);
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

    const resumeRes = await connectorResumer(connector.id.toString());

    if (resumeRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Could not resume the connector",
        },
      });
    }

    return res.status(200).json({
      connectorId: resumeRes.value,
    });
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
