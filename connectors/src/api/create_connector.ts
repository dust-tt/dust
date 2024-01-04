import { assertNever, Result } from "@dust-tt/types";
import { Request, Response } from "express";

import { CREATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import {
  ConnectorCreatorOauth,
  ConnectorCreatorUrl,
} from "@connectors/connectors/interface";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorType } from "@connectors/types/connector";
import { isConnectorProvider } from "@connectors/types/connector";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorCreateRequired = {
  workspaceAPIKey: string;
  dataSourceName: string;
  workspaceId: string;
};

type ConnectorCreateOAuth = ConnectorCreateRequired & {
  connectionId: string;
  type: "oauth";
};

type ConnectorCreateUrl = ConnectorCreateRequired & {
  url: string;
  type: "url";
};

type ConnectorCreateReqBody = ConnectorCreateOAuth | ConnectorCreateUrl;

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
      !req.body.workspaceId
    ) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Missing required parameters. Required : workspaceAPIKey,
           dataSourceName, workspaceId. Optional: connectionId`,
        },
      });
    }

    if (!isConnectorProvider(req.params.connector_provider)) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "unknown_connector_provider",
          message: `Unknown connector provider ${req.params.connector_provider}`,
        },
      });
    }

    let connectorRes: Result<string, Error> | null = null;
    switch (req.body.type) {
      case "oauth": {
        const connectorCreator = CREATE_CONNECTOR_BY_TYPE[
          req.params.connector_provider
        ] as ConnectorCreatorOauth;

        connectorRes = await connectorCreator(
          {
            workspaceAPIKey: req.body.workspaceAPIKey,
            dataSourceName: req.body.dataSourceName,
            workspaceId: req.body.workspaceId,
          },
          req.body.connectionId
        );
        break;
      }
      case "url": {
        const connectorCreator = CREATE_CONNECTOR_BY_TYPE[
          req.params.connector_provider
        ] as ConnectorCreatorUrl;
        connectorRes = await connectorCreator(
          {
            workspaceAPIKey: req.body.workspaceAPIKey,
            dataSourceName: req.body.dataSourceName,
            workspaceId: req.body.workspaceId,
          },
          req.body.url,
          10
        );
        break;
      }

      default: {
        assertNever(req.body);
      }
    }

    if (connectorRes.isErr()) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: connectorRes.error.message,
        },
      });
    }

    const connector = await Connector.findByPk(connectorRes.value);
    if (!connector) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Created connector not found in database. Connector id: ${connectorRes.value}`,
        },
      });
    }

    await connector.reload();

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
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "An unexpected error occured while creating the connector.",
      },
    });
  }
};

export const createConnectorAPIHandler = withLogging(
  _createConnectorAPIHandler
);
