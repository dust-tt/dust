/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import {
  getManagedDataSourcePermissions,
  ManagedPermissionsQuerySchema,
} from "@app/lib/api/data_sources/managed_permissions";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodeWithParent,
} from "@app/types/connectors/connectors_api";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const SetConnectorPermissionsRequestBodySchema = z.object({
  resources: z.array(
    z.object({
      internal_id: z.string(),
      permission: z.enum(["none", "read", "write", "read_write"]),
    })
  ),
});

export type GetDataSourcePermissionsResponseBody<
  T extends ConnectorPermission = ConnectorPermission,
> = {
  resources: (T extends "read" ? ContentNodeWithParent : ContentNode)[];
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

  if (!dataSource.canAdministrate(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message:
          "Only the users that are `admins` for the current workspace can administrate a data source.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const q = ManagedPermissionsQuerySchema.safeParse(req.query);
      if (!q.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid query parameters: ${fromError(q.error).toString()}`,
          },
        });
      }

      // Auth gating: read = anyone, write = builder, undefined (all) = admin.
      switch (q.data.filterPermission) {
        case "read":
          break;
        case "write":
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
          assertNever(q.data.filterPermission);
      }

      const result = await getManagedDataSourcePermissions(
        dataSource.connectorId,
        q.data
      );

      if (result.isErr()) {
        switch (result.error.type) {
          case "connector_rate_limit":
            return apiError(req, res, {
              status_code: 429,
              api_error: {
                type: "rate_limit_error",
                message:
                  "Rate limit error while retrieving the data source permissions",
              },
            });
          case "connector_authorization_error":
            return apiError(req, res, {
              status_code: 401,
              api_error: {
                type: "data_source_auth_error",
                message:
                  "Authorization error while retrieving the data source permissions.",
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message:
                  "An error occurred while retrieving the data source permissions.",
              },
            });
          default:
            assertNever(result.error);
        }
      }

      res.status(200).json(result.value);
      return;
    }

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

      const bodyValidation = SetConnectorPermissionsRequestBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        const pathError = fromError(bodyValidation.error).toString();
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const { resources } = bodyValidation.data;

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

export default withSessionAuthenticationForWorkspace(handler);
