import { Request, Response } from "express";

import { CREATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorCreateReqBody = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorCreateResBody =
  | { connectorId: string }
  | ConnectorsAPIErrorResponse;

const _createConnectorAPIHandler = async (
  req: Request<
    { connector_provider: string },
    ConnectorCreateResBody,
    ConnectorCreateReqBody
  >,
  res: Response<ConnectorCreateResBody>
) => {
  try {
    if (
      !req.body.workspaceAPIKey ||
      !req.body.dataSourceName ||
      !req.body.workspaceId ||
      !req.body.nangoConnectionId
    ) {
      // We would probably want to return the same error inteface than we use in the /front package. TBD.
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
    const connectorCreator =
      CREATE_CONNECTOR_BY_TYPE[req.params.connector_provider];

    const connectorRes = await connectorCreator(
      {
        workspaceAPIKey: req.body.workspaceAPIKey,
        dataSourceName: req.body.dataSourceName,
        workspaceId: req.body.workspaceId,
      },
      req.body.nangoConnectionId
    );

    if (connectorRes.isErr()) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: connectorRes.error.message,
        },
        status_code: 500,
      });
    }

    return res.status(200).json({ connectorId: connectorRes.value });
  } catch (e) {
    logger.error(errorFromAny(e), "Error in createConnectorAPIHandler");
    return apiError(req, res, {
      api_error: {
        type: "internal_server_error",
        message: "An unexpected error occured while creating the connector.",
      },
      status_code: 500,
    });
  }
};

export const createConnectorAPIHandler = withLogging(
  _createConnectorAPIHandler
);
