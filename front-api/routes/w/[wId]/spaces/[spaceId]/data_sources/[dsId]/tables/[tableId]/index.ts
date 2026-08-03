import { upsertTable } from "@app/lib/api/data_sources";
import { deleteTable } from "@app/lib/api/tables";
import { PatchDataSourceTableRequestBodySchema } from "@app/types/api/public/data_sources";
import type { PatchTableResponseBody } from "@app/types/api/tables";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSource } from "@front-api/middlewares/with_data_source";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

const ParamsSchema = z.object({
  tableId: z.string(),
});

// Mounted at /api/w/:wId/spaces/:spaceId/data_sources/:dsId/tables/:tableId.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  validate("json", PatchDataSourceTableRequestBodySchema),
  async (ctx): HandlerResult<PatchTableResponseBody> => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");
    const { tableId } = ctx.req.valid("param");

    if (!dataSource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    if (dataSource.connectorId) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You cannot upsert a document on a managed data source.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const upsertRes = await upsertTable({
      auth,
      params: {
        ...body,
        tableId,
        async: body.async ?? false,
      },
      dataSource,
    });
    if (upsertRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error upserting the document.",
        },
      });
    }

    return ctx.json({ table: upsertRes.value?.table });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");
    const { tableId } = ctx.req.valid("param");

    if (!dataSource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to delete data in this data source.",
        },
      });
    }

    const delRes = await deleteTable({
      owner: auth.getNonNullableWorkspace(),
      dataSource,
      tableId,
    });
    if (delRes.isErr()) {
      switch (delRes.error.type) {
        case "not_found_error":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: delRes.error.notFoundError.type,
              message: delRes.error.notFoundError.message,
            },
          });
        case "invalid_request_error":
        case "internal_server_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to delete table.",
            },
          });
        default:
          assertNever(delRes.error);
      }
    }

    return ctx.body(null, 200);
  }
);

export default app;
