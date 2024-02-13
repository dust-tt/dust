import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import {
  GET_CONNECTOR_CONFIG_BY_TYPE,
  SET_CONNECTOR_CONFIG_BY_TYPE,
} from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

const ConfigSetReqBodySchema = t.type({
  configValue: t.string,
});
type ConfigSetReqBody = t.TypeOf<typeof ConfigSetReqBodySchema>;

type ConfigGetResBody = WithConnectorsAPIErrorReponse<{
  connectorId: number;
  configKey: string;
  configValue: string;
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

  const connector = await ConnectorModel.findOne({
    where: { id: req.params.connector_id },
  });
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: `Connector with id ${req.params.connector_id} not found`,
      },
      status_code: 404,
    });
  }
  const getter = GET_CONNECTOR_CONFIG_BY_TYPE[connector.type];
  const configValueRes = await getter(connector.id, req.params.config_key);
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
  const connector = await ConnectorModel.findOne({
    where: { id: req.params.connector_id },
  });
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: `Connector with id ${req.params.connector_id} not found`,
      },
      status_code: 404,
    });
  }
  const setter = SET_CONNECTOR_CONFIG_BY_TYPE[connector.type];
  const setConfigRes = await setter(
    connector.id,
    req.params.config_key,
    req.body.configValue
  );
  if (setConfigRes.isErr()) {
    return apiError(
      req,
      res,
      {
        api_error: {
          type: "internal_server_error",
          message: `Unable to set config value for connector ${connector.id} and key ${req.params.config_key}`,
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
