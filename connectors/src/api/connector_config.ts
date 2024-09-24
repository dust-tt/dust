import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { getConnectorManager } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const ConfigSetReqBodySchema = t.type({
  configValue: t.string,
});
type ConfigSetReqBody = t.TypeOf<typeof ConfigSetReqBodySchema>;

type ConfigGetResBody = WithConnectorsAPIErrorReponse<{
  connectorId: number;
  configKey: string;
  configValue: string | null;
}>;

const _getConnectorConfig = async (
  req: Request<{ connector_id: string; config_key: string }>,
  res: Response<ConfigGetResBody>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }
  if (!req.params.config_key) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: config_key",
      },
      status_code: 400,
    });
  }

  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: `Connector with id ${req.params.connector_id} not found`,
      },
      status_code: 404,
    });
  }

  const configValueRes = await getConnectorManager({
    connectorId: connector.id,
    connectorProvider: connector.type,
  }).getConfigurationKey({ configKey: req.params.config_key });
  if (configValueRes.isErr()) {
    return apiError(
      req,
      res,
      {
        api_error: {
          type: "internal_server_error",
          message: `Unable to get config value for connector ${connector.id} and key ${req.params.config_key}`,
        },
        status_code: 500,
      },
      configValueRes.error
    );
  }

  return res.status(200).json({
    connectorId: connector.id,
    configKey: req.params.config_key,
    configValue: configValueRes.value,
  });
};

export const getConnectorConfigAPIHandler = withLogging(_getConnectorConfig);

const _setConnectorConfig = async (
  req: Request<
    { connector_id: string; config_key: string },
    ConfigGetResBody,
    ConfigSetReqBody
  >,
  res: Response<ConfigGetResBody>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }
  if (!req.params.config_key) {
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: config_key",
      },
      status_code: 400,
    });
  }

  const bodyValidation = ConfigSetReqBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
      status_code: 400,
    });
  }
  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: `Connector with id ${req.params.connector_id} not found`,
      },
      status_code: 404,
    });
  }

  const setConfigRes = await getConnectorManager({
    connectorId: connector.id,
    connectorProvider: connector.type,
  }).setConfigurationKey({
    configKey: req.params.config_key,
    configValue: req.body.configValue,
  });
  if (setConfigRes.isErr()) {
    return apiError(
      req,
      res,
      {
        api_error: {
          type: "internal_server_error",
          message: setConfigRes.error.message,
        },
        status_code: 500,
      },
      setConfigRes.error
    );
  }

  return res.status(200).json({
    connectorId: connector.id,
    configKey: req.params.config_key,
    configValue: req.body.configValue,
  });
};

export const setConnectorConfigAPIHandler = withLogging(_setConnectorConfig);
