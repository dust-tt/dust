import {
  getManagedDataSourcePermissions,
  ManagedPermissionsQuerySchema,
  type ManagedPermissionsResponse,
} from "@app/lib/api/data_sources/managed_permissions";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type {
  ManagedPermissionsResponse as PokeGetDataSourcePermissionsResponseBody,
};

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/managed/permissions.
const app = pokeApp();

app.get(
  "/",
  validate("query", ManagedPermissionsQuerySchema),
  async (ctx): HandlerResult<ManagedPermissionsResponse> => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId") ?? "";

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

    const query = ctx.req.valid("query");
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

export default app;
