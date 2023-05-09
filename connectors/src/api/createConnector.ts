import { Request, Response } from "express";

import { CREATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import { reportInitialSyncProgress } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorType } from "@connectors/types/connector";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorCreateReqBody = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
  nangoConnectionId: string;
};

type ConnectorCreateResBody = ConnectorType | ConnectorsAPIErrorResponse;

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
      return apiError(req, res, {
        api_error: {
          type: "invalid_request_error",
          message: `Missing required parameters. Required : workspaceAPIKey,
           dataSourceName, workspaceId, nangoConnectionId`,
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
    await reportInitialSyncProgress(parseInt(connectorRes.value), "0%");

    const connector = await Connector.findByPk(connectorRes.value);
    if (!connector) {
      return apiError(req, res, {
        api_error: {
          type: "internal_server_error",
          message: `Created connector not found in database. Connector id: ${connectorRes.value}`,
        },
        status_code: 500,
      });
    }
    return res.status(200).json({
      id: connector.id,
      type: connector.type,
      lastSyncStatus: connector.lastSyncStatus,
      lastSyncStartTime: connector.lastSyncStartTime?.getTime(),
      lastSyncSuccessfulTime: connector.lastSyncSuccessfulTime?.getTime(),
      firstSuccessfulSyncTime: connector.firstSuccessfulSyncTime?.getTime(),
      firstSyncProgress: connector.firstSyncProgress,
    });
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
