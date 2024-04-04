import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import { UpdateConnectorRequestBodySchema } from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

import { UPDATE_CONNECTOR_BY_TYPE } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type ConnectorUpdateReqBody = {
  connectionId?: string | null;
};
type ConnectorUpdateResBody = WithConnectorsAPIErrorReponse<{
  connectorId: string;
}>;

const _postConnectorUpdateAPIHandler = async (
  req: Request<{ connector_id: string }, ConnectorUpdateReqBody>,
  res: Response<ConnectorUpdateResBody>
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

  const bodyValidation = UpdateConnectorRequestBodySchema.decode(req.body);
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

  const { connectionId } = bodyValidation.right;

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

  const connectorUpdater = UPDATE_CONNECTOR_BY_TYPE[connector.type];
  const updateRes = await connectorUpdater(connector.id, {
    connectionId: connectionId,
  });

  if (updateRes.isErr()) {
    if (updateRes.error.type === "connector_oauth_target_mismatch") {
      return apiError(req, res, {
        api_error: updateRes.error,
        status_code: 401,
      });
    } else {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Could not update the connector: ${updateRes.error.message}`,
        },
      });
    }
  }

  return res.status(200).json({
    connectorId: updateRes.value,
  });
};

export const postConnectorUpdateAPIHandler = withLogging(
  _postConnectorUpdateAPIHandler
);
