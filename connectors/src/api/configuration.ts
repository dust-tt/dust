import type { Result } from "@dust-tt/client";
import { assertNever } from "@dust-tt/client";
import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  ConnectorType,
  UpdateConnectorConfigurationType,
} from "@connectors/types";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";
import {
  ioTsParsePayload,
  WebCrawlerConfigurationTypeSchema,
} from "@connectors/types";

type PatchConnectorConfigurationResBody =
  WithConnectorsAPIErrorReponse<ConnectorType>;

const _patchConnectorConfiguration = async (
  req: Request<
    { connector_id: string },
    PatchConnectorConfigurationResBody,
    UpdateConnectorConfigurationType
  >,
  res: Response<PatchConnectorConfigurationResBody>
) => {
  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }

  let patchRes: Result<void, Error> | null = null;
  switch (connector.type) {
    case "webcrawler": {
      const parseRes = ioTsParsePayload(
        req.body.configuration,
        WebCrawlerConfigurationTypeSchema
      );
      if (parseRes.isErr()) {
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid configuration: ${parseRes.error.join(", ")}`,
          },
          status_code: 400,
        });
      }

      patchRes = await getConnectorManager({
        connectorId: connector.id,
        connectorProvider: "webcrawler",
      }).configure({ configuration: parseRes.value });
      break;
    }

    case "notion":
    case "confluence":
    case "discord_bot":
    case "github":
    case "google_drive":
    case "intercom":
    case "microsoft":
    case "microsoft_bot":
    case "snowflake":
    case "bigquery":
    case "zendesk":
    case "gong":
    case "slack_bot":
    case "slack": {
      throw new Error(
        `Connector type ${connector.type} does not support configuration patching`
      );
    }
    // TODO(salesforce): implement this
    case "salesforce": {
      throw new Error(`Connector type ${connector.type} NOT IMPLEMENTED YET`);
    }

    default: {
      assertNever(connector.type);
    }
  }

  if (patchRes?.isErr()) {
    return apiError(
      req,
      res,
      {
        api_error: {
          type: "internal_server_error",
          message: patchRes.error.message,
        },
        status_code: 500,
      },
      patchRes.error
    );
  }

  const updatedConnector = await ConnectorResource.fetchById(
    req.params.connector_id
  );
  if (!updatedConnector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
    });
  }
  return res.status(200).json(updatedConnector.toJSON());
};

export const patchConnectorConfigurationAPIHandler = withLogging(
  _patchConnectorConfiguration
);
