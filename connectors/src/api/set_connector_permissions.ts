import type { WithConnectorsAPIErrorReponse } from "@dust-tt/types";
import type { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { SET_CONNECTOR_PERMISSIONS_BY_TYPE } from "@connectors/connectors";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorResource } from "@connectors/resources/connector_resource";

type SetConnectorPermissionsRes = WithConnectorsAPIErrorReponse<{
  success: true;
}>;

const SetConnectorPermissionsRequestBodySchema = t.type({
  resources: t.array(
    t.type({
      internal_id: t.string,
      permission: t.union([
        t.literal("none"),
        t.literal("read"),
        t.literal("write"),
        t.literal("read_write"),
      ]),
    })
  ),
});
type SetConnectorPermissionsRequestBody = t.TypeOf<
  typeof SetConnectorPermissionsRequestBodySchema
>;

const _setConnectorPermissions = async (
  req: Request<
    { connector_id: string },
    SetConnectorPermissionsRes,
    SetConnectorPermissionsRequestBody
  >,
  res: Response<SetConnectorPermissionsRes>
) => {
  if (!req.params.connector_id) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
    });
  }

  const bodyValidation = SetConnectorPermissionsRequestBodySchema.decode(
    req.body
  );

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

  const { resources } = bodyValidation.right;

  const connector = await ConnectorResource.fetchById(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
    });
  }

  const connectorPermissionSetter =
    SET_CONNECTOR_PERMISSIONS_BY_TYPE[connector.type];

  const pRes = await connectorPermissionSetter(
    connector.id,
    resources.reduce(
      (acc, r) => Object.assign(acc, { [r.internal_id]: r.permission }),
      {}
    )
  );

  if (pRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: pRes.error.message,
      },
    });
  }

  return res.status(200).json({ success: true });
};

export const setConnectorPermissionsAPIHandler = withLogging(
  _setConnectorPermissions
);
