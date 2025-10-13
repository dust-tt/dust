import type { Result } from "@dust-tt/client";
import { assertNever, isConnectorProvider } from "@dust-tt/client";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { createConnector } from "@connectors/connectors";
import type {
  ConnectorManagerError,
  CreateConnectorErrorCode,
} from "@connectors/connectors/interface";
import { errorFromAny } from "@connectors/lib/error";
import logger from "@connectors/logger/logger";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorType } from "@connectors/types";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import {
  ioTsParsePayload,
  SlackConfigurationTypeSchema,
  WebCrawlerConfigurationTypeSchema,
} from "@connectors/types";
import { ConnectorConfigurationTypeSchema } from "@connectors/types";
import { normalizeError } from "@connectors/types";

const ConnectorCreateRequestBodySchema = t.type({
  workspaceAPIKey: t.string,
  dataSourceId: t.string,
  workspaceId: t.string,
  connectionId: t.string,
  configuration: ConnectorConfigurationTypeSchema,
});

type ConnectorCreateResBody = WithConnectorsAPIErrorReponse<ConnectorType>;

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

    const {
      workspaceId,
      workspaceAPIKey,
      dataSourceId,
      connectionId,
      configuration,
    } = bodyValidation.right;

    let connectorRes: Result<
      string,
      ConnectorManagerError<CreateConnectorErrorCode>
    > | null = null;

    switch (req.params.connector_provider) {
      case "webcrawler": {
        const configurationRes = ioTsParsePayload(
          configuration,
          WebCrawlerConfigurationTypeSchema
        );
        if (configurationRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body: ${configurationRes.error}`,
            },
          });
        }
        connectorRes = await createConnector({
          connectorProvider: "webcrawler",
          params: {
            configuration: configurationRes.value,
            dataSourceConfig: {
              workspaceId,
              dataSourceId,
              workspaceAPIKey,
            },
            connectionId,
          },
        });
        break;
      }

      case "slack":
      case "slack_bot": {
        const configurationRes = ioTsParsePayload(
          configuration,
          SlackConfigurationTypeSchema
        );
        if (configurationRes.isErr()) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body: ${configurationRes.error}`,
            },
          });
        }
        connectorRes = await createConnector({
          connectorProvider: req.params.connector_provider,
          params: {
            configuration: configurationRes.value,
            dataSourceConfig: {
              workspaceId,
              workspaceAPIKey,
              dataSourceId,
            },
            connectionId,
          },
        });
        break;
      }

      case "github":
      case "notion":
      case "confluence":
      case "google_drive":
      case "intercom":
      case "snowflake":
      case "bigquery":
      case "zendesk":
      case "microsoft":
      case "microsoft_bot":
      case "salesforce":
      case "gong": {
        connectorRes = await createConnector({
          connectorProvider: req.params.connector_provider,
          params: {
            dataSourceConfig: {
              workspaceId,
              workspaceAPIKey,
              dataSourceId,
            },
            connectionId,
            configuration: null,
          },
        });
        break;
      }

      default:
        assertNever(req.params.connector_provider);
    }

    if (connectorRes.isErr()) {
      // Error result means this is an "expected" error, so not an internal server error. We return
      // a 4xx status code for expected errors.
      switch (connectorRes.error.code) {
        case "INVALID_CONFIGURATION":
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: connectorRes.error.message,
            },
          });
        default:
          assertNever(connectorRes.error.code);
      }
    }

    const connector = await ConnectorResource.fetchById(connectorRes.value);

    if (!connector) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Created connector not found in database. Connector id: ${connectorRes.value}`,
        },
      });
    }

    return res.status(200).json(connector.toJSON());
  } catch (e) {
    logger.error(errorFromAny(e), "Error in createConnectorAPIHandler");

    const errorMessage = `An unexpected error occured while creating the ${req.params.connector_provider} connector`;

    return apiError(
      req,
      res,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: errorMessage,
        },
      },
      normalizeError(e)
    );
  }
};

export const createConnectorAPIHandler = withLogging(
  _createConnectorAPIHandler
);
