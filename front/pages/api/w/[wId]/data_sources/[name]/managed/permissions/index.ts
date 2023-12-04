import {
  ConnectorPermission,
  ConnectorResource,
  ConnectorsAPI,
} from "@dust-tt/types";
import { ReturnedAPIErrorType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSource } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";

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

export type GetDataSourcePermissionsResponseBody = {
  resources: ConnectorResource[];
};

export type SetDataSourcePermissionsResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetDataSourcePermissionsResponseBody
    | ReturnedAPIErrorType
    | SetDataSourcePermissionsResponseBody
  >
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const dataSource = await getDataSource(auth, req.query.name as string);
  if (!dataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  if (!dataSource.connectorId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "data_source_not_managed",
        message: "The data source you requested is not managed.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can view the permissions of a data source.",
      },
    });
  }
  const connectorsAPI = new ConnectorsAPI(logger);

  switch (req.method) {
    case "GET":
      let parentId: string | undefined = undefined;
      if (req.query.parentId && typeof req.query.parentId === "string") {
        parentId = req.query.parentId;
      }

      let filterPermission: ConnectorPermission | undefined = undefined;
      if (
        req.query.filterPermission &&
        typeof req.query.filterPermission === "string"
      ) {
        switch (req.query.filterPermission) {
          case "read":
            filterPermission = "read";
            break;
          case "write":
            filterPermission = "write";
            break;
        }
      }

      const permissionsRes = await connectorsAPI.getConnectorPermissions({
        connectorId: dataSource.connectorId,
        parentId,
        filterPermission,
      });
      if (permissionsRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `An error occurred while retrieving the data source permissions.`,
          },
        });
      }

      const permissions = permissionsRes.value.resources;

      res.status(200).json({
        resources: permissions,
      });
      return;

    case "POST":
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only the users that are `admins` for the current workspace can edit the permissions of a data source.",
          },
        });
      }

      const body = req.body;
      if (!body) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Missing required parameters. Required: resources",
          },
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

      const connectorsRes = await connectorsAPI.setConnectorPermissions({
        connectorId: dataSource.connectorId,
        resources: resources.map((r) => ({
          internalId: r.internal_id,
          permission: r.permission,
        })),
      });

      if (connectorsRes.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: connectorsRes.error.error.message,
          },
        });
      }

      res.status(200).json({
        success: true,
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
