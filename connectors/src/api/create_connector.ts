import type {
  ConnectorProvider,
  ConnectorType,
  CreateConnectorOAuthRequestBodySchema,
  CreateConnectorUrlRequestBodySchema,
  Result,
} from "@dust-tt/types";
import {
  assertNever,
  ConnectorCreateRequestBodySchema,
  isConnectorProvider,
} from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import type * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { CREATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import type {
  ConnectorCreatorOAuth,
  ConnectorCreatorUrl,
} from "@connectors/connectors/interface";
import { errorFromAny } from "@connectors/lib/error";
import { Connector } from "@connectors/lib/models";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import type { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type ConnectorCreateResBody = ConnectorType | ConnectorsAPIErrorResponse;

const provider2createConnectorType: Record<ConnectorProvider, "oauth" | "url"> =
  {
    confluence: "oauth",
    github: "oauth",
    google_drive: "oauth",
    slack: "oauth",
    notion: "oauth",
    intercom: "oauth",
    webcrawler: "url",
  };

const _createConnectorAPIHandler = async (
  req: Request<{ connector_provider: string }, ConnectorCreateResBody>,
  res: Response<ConnectorCreateResBody>
) => {
  try {
    const bodyValidation = ConnectorCreateRequestBodySchema.decode(req.body);
    if (isLeft(bodyValidation)) {
      const pathError = reporter.formatValidationErrors(bodyValidation.left);

      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid request body: ${pathError}`,
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

    const { workspaceAPIKey, dataSourceName, workspaceId, connectorParams } =
      bodyValidation.right;

    let connectorRes: Result<string, Error>;
    const createConnectorType =
      provider2createConnectorType[req.params.connector_provider];
    switch (createConnectorType) {
      case "oauth": {
        const connectorCreator = CREATE_CONNECTOR_BY_TYPE[
          req.params.connector_provider
        ] as ConnectorCreatorOAuth;

        const params = connectorParams as t.TypeOf<
          typeof CreateConnectorOAuthRequestBodySchema
        >;
        connectorRes = await connectorCreator(
          {
            workspaceAPIKey: workspaceAPIKey,
            dataSourceName: dataSourceName,
            workspaceId: workspaceId,
          },
          params.connectionId
        );
        break;
      }
      case "url": {
        const connectorCreator = CREATE_CONNECTOR_BY_TYPE[
          req.params.connector_provider
        ] as ConnectorCreatorUrl;

        const params = connectorParams as t.TypeOf<
          typeof CreateConnectorUrlRequestBodySchema
        >;
        connectorRes = await connectorCreator(
          {
            workspaceAPIKey: workspaceAPIKey,
            dataSourceName: dataSourceName,
            workspaceId: workspaceId,
          },
          params.url
        );
        break;
      }

      default: {
        assertNever(createConnectorType);
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
      id: connector.id.toString(),
      type: connector.type,
      workspaceId: connector.workspaceId,
      dataSourceName: connector.dataSourceName,
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
