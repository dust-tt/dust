import type {
  ConnectorType,
  Result,
  UpdateConnectorConfigurationType,
  WithConnectorsAPIErrorReponse,
} from "@dust-tt/types";
import {
  assertNever,
  ioTsParsePayload,
  WebCrawlerConfigurationTypeSchema,
} from "@dust-tt/types";
import type { Request, Response } from "express";

import { getConnectorManager } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

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
    case "github":
    case "google_drive":
    case "intercom":
    case "microsoft":
    case "snowflake":
    case "slack": {
      throw new Error(
        `Connector type ${connector.type} does not support configuration patching`
      );
    }

    default: {
      assertNever(connector.type);
    }
  }

  if (patchRes.isErr()) {
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
