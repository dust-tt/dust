import { assertNever } from "@dust-tt/client";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { getConnectorManager } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { WithConnectorsAPIErrorReponse } from "@connectors/types";

const UpdateConnectorRequestBodySchema = t.type({
  connectionId: t.string,
});

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

  const updateRes = await getConnectorManager({
    connectorProvider: connector.type,
    connectorId: connector.id,
  }).update({
    connectionId: connectionId,
  });

  if (updateRes.isErr()) {
    switch (updateRes.error.code) {
      case "CONNECTOR_OAUTH_TARGET_MISMATCH":
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "connector_oauth_target_mismatch",
            message: updateRes.error.message,
          },
        });
      case "CONNECTOR_OAUTH_USER_MISSING_RIGHTS":
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "connector_oauth_user_missing_rights",
            message: updateRes.error.message,
          },
        });
      case "INVALID_CONFIGURATION":
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: updateRes.error.message,
          },
        });
      default:
        assertNever(updateRes.error.code);
    }
  }

  await connector.update({ errorType: null, pausedAt: null });

  return res.status(200).json({
    connectorId: updateRes.value,
  });
};

export const postConnectorUpdateAPIHandler = withLogging(
  _postConnectorUpdateAPIHandler
);
