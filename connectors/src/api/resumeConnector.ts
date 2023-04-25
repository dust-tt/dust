import { Request, Response } from "express";

import { RESUME_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorResumeReqBody = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorResumeResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _resumeConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorResumeResBody,
    ConnectorResumeReqBody
  >,
  res: Response<ConnectorResumeResBody>
) => {
  try {
    if (
      !req.body.workspaceAPIKey ||
      !req.body.dataSourceName ||
      !req.body.workspaceId ||
      !req.body.nangoConnectionId
    ) {
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: `Missing required parameters. Required : workspaceAPIKey, dataSourceName, workspaceId, nangoConnectionId`,
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
    const connectorResumer =
      RESUME_CONNECTOR_BY_TYPE[req.params.connector_provider];

    const resumeRes = await connectorResumer(
      {
        workspaceAPIKey: req.body.workspaceAPIKey,
        dataSourceName: req.body.dataSourceName,
        workspaceId: req.body.workspaceId,
      },
      req.body.nangoConnectionId
    );

    if (resumeRes.isErr()) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: "Could not resume the connector",
        },
        status_code: 500,
      });
    }

    return res.status(200).json({
      connectorId: resumeRes.value,
    });
  } catch (e) {
    logger.error(errorFromAny(e), "Failed to resume the connector");
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: "Could not resume the connector",
      },
      status_code: 500,
    });
  }
};

export const resumeConnectorAPIHandler = withLogging(
  _resumeConnectorAPIHandler
);
