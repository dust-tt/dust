import type {
  ConnectorPermission,
  ContentNode,
  DataSourceType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { assertNever, ConnectorsAPI } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";

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
  resources: ContentNode[];
};

export type SetDataSourcePermissionsResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetDataSourcePermissionsResponseBody
      | SetDataSourcePermissionsResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can see or edit the permissions of a data source.",
      },
    });
  }

  const { dsId } = req.query;
  if (typeof dsId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
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

  switch (req.method) {
    case "GET":
      return getManagedDataSourcePermissionsHandler(
        auth,
        // To make typescript happy.
        { ...dataSource.toJSON(), connectorId: dataSource.connectorId },
        req,
        res
      );

    case "POST":
      const connectorsAPI = new ConnectorsAPI(
        config.getConnectorsAPIConfig(),
        logger
      );

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
            message: "Failed to set the permissions of the data source.",
            connectors_error: connectorsRes.error,
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

export async function getManagedDataSourcePermissionsHandler(
  auth: Authenticator,
  dataSource: DataSourceType & { connectorId: string },
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetDataSourcePermissionsResponseBody>
  >
) {
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

  switch (filterPermission) {
    case "read":
      // We let users get the read  permissions of a connector
      // `read` is used for data source selection when creating personal assitsants
      break;
    case "write":
      // We let builders get the write permissions of a connector.
      // `write` is used for selection of default slack channel in the workspace assistant
      // builder.
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only builders of the current workspace can view 'write' permissions of a data source.",
          },
        });
      }
      break;
    case undefined:
      // Only admins can browse "all" the resources of a connector.
      if (!auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "data_source_auth_error",
            message:
              "Only admins of the current workspace can view all permissions of a data source.",
          },
        });
      }
      break;
    default:
      assertNever(filterPermission);
  }

  const viewType = req.query.viewType;
  if (
    !viewType ||
    typeof viewType !== "string" ||
    (viewType !== "tables" && viewType !== "documents")
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid viewType. Required: tables | documents",
      },
    });
  }

  const connectorsAPI = new ConnectorsAPI(
    config.getConnectorsAPIConfig(),
    logger
  );
  const permissionsRes = await connectorsAPI.getConnectorPermissions({
    connectorId: dataSource.connectorId,
    parentId,
    filterPermission,
    viewType,
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
}

export default withSessionAuthenticationForWorkspace(handler);
