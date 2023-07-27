import { Request, Response } from "express";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";

import { SET_CONNECTOR_PERMISSIONS_BY_TYPE } from "@connectors/connectors";
import { Connector } from "@connectors/lib/models";
import { apiError, withLogging } from "@connectors/logger/withlogging";
import { ConnectorsAPIErrorResponse } from "@connectors/types/errors";

type SetConnectorPermissionsRes =
  | { success: true }
  | ConnectorsAPIErrorResponse;

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
      api_error: {
        type: "invalid_request_error",
        message: "Missing required parameters. Required: connector_id",
      },
      status_code: 400,
    });
  }

  const bodyValidation = SetConnectorPermissionsRequestBodySchema.decode(
    req.body
  );

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

  const { resources } = bodyValidation.right;

  const connector = await Connector.findByPk(req.params.connector_id);
  if (!connector) {
    return apiError(req, res, {
      api_error: {
        type: "connector_not_found",
        message: "Connector not found",
      },
      status_code: 404,
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
      api_error: {
        type: "internal_server_error",
        message: pRes.error.message,
      },
      status_code: 500,
    });
  }

  return res.status(200).json({ success: true });
};

export const setConnectorPermissionsAPIHandler = withLogging(
  _setConnectorPermissions
);
