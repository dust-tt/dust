import config from "@app/lib/api/config";
import type { GetDataSourcePermissionsResponseBody } from "@app/lib/api/data_sources/managed_permissions";
import {
  getManagedDataSourcePermissions,
  ManagedPermissionsQuerySchema,
} from "@app/lib/api/data_sources/managed_permissions";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const SetConnectorPermissionsRequestBodySchema = z.object({
  resources: z.array(
    z.object({
      internal_id: z.string(),
      permission: z.enum(["none", "read", "write", "read_write"]),
    })
  ),
});

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/w/:wId/data_sources/:dsId/managed/permissions.
const app = workspaceApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", ManagedPermissionsQuerySchema),
  async (ctx): HandlerResult<GetDataSourcePermissionsResponseBody> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }
    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_not_managed",
          message: "The data source you requested is not managed.",
        },
      });
    }
    if (!dataSource.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `admins` for the current workspace can administrate a data source.",
        },
      });
    }

    const query = ctx.req.valid("query");

    // Auth gating: read = anyone, write = builder, undefined (all) = admin.
    switch (query.filterPermission) {
      case "read":
        // `read` is used for data source selection when creating personal assistants.
        break;
      case "write":
        // `write` is used for selection of default slack channel in the workspace agent builder.
        // biome-ignore lint/plugin/noDirectRoleCheck: conditional role check based on filterPermission query param
        if (!auth.isBuilder()) {
          return apiError(ctx, {
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
        // biome-ignore lint/plugin/noDirectRoleCheck: conditional role check based on filterPermission query param
        if (!auth.isAdmin()) {
          return apiError(ctx, {
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
        assertNever(query.filterPermission);
    }

    const result = await getManagedDataSourcePermissions(
      dataSource.connectorId,
      query
    );

    if (result.isErr()) {
      switch (result.error.type) {
        case "connector_rate_limit":
          return apiError(ctx, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message:
                "Rate limit error while retrieving the data source permissions",
            },
          });
        case "connector_authorization_error":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "data_source_auth_error",
              message:
                "Authorization error while retrieving the data source permissions.",
            },
          });
        case "internal_error":
          return apiError(ctx, {
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

    return ctx.json(result.value);
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", SetConnectorPermissionsRequestBodySchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }
    if (!dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_not_managed",
          message: "The data source you requested is not managed.",
        },
      });
    }
    if (!dataSource.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message:
            "Only the users that are `admins` for the current workspace can administrate a data source.",
        },
      });
    }

    const { resources } = ctx.req.valid("json");

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );
    const connectorsRes = await connectorsAPI.setConnectorPermissions({
      connectorId: dataSource.connectorId,
      resources: resources.map((r) => ({
        internalId: r.internal_id,
        permission: r.permission,
      })),
    });

    if (connectorsRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to set the permissions of the data source.",
          connectors_error: connectorsRes.error,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
