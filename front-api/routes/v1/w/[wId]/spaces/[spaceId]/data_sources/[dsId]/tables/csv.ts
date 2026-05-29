import {
  resolveLegacyDataSourceSpaceId,
  upsertTable,
} from "@app/lib/api/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type {
  PostTableCSVAsyncResponseType,
  PostTableCSVResponseType,
} from "@dust-tt/client";
import { UpsertTableFromCsvRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  dsId: z.string(),
  spaceId: z.string().optional(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
const app = publicApiApp();

app.post(
  "/",
  ensureIsSystemKey(),
  validate("param", ParamsSchema),
  validate("json", UpsertTableFromCsvRequestSchema),
  async (
    ctx
  ): HandlerResult<
    PostTableCSVAsyncResponseType | PostTableCSVResponseType
  > => {
    const auth = ctx.get("auth");
    const { dsId, spaceId: spaceIdParam } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchByNameOrId(
      auth,
      dsId,
      // TODO(DATASOURCE_SID): Clean-up
      { origin: "v1_data_sources_tables_csv" }
    );

    const spaceId = await resolveLegacyDataSourceSpaceId(
      auth,
      spaceIdParam,
      dataSource
    );

    if (!dataSource || dataSource.space.sId !== spaceId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    if (dataSource.space.kind === "conversations") {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you're trying to access was not found",
        },
      });
    }

    const params = ctx.req.valid("json");

    const upsertRes = await upsertTable({
      auth,
      params,
      dataSource,
    });

    if (upsertRes.isErr()) {
      switch (upsertRes.error.code) {
        case "invalid_csv_and_file":
        case "invalid_parent_id":
        case "invalid_parents":
        case "invalid_url":
        case "title_is_empty":
        case "title_too_long":
        case "missing_csv":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: upsertRes.error.message,
            },
          });
        case "invalid_csv_content":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_rows_request_error",
              message: upsertRes.error.message,
            },
          });
        case "data_source_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "data_source_error",
              message: upsertRes.error.message,
            },
          });
        case "table_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "table_not_found",
              message: upsertRes.error.message,
            },
          });
        case "file_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "file_not_found",
              message: upsertRes.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: upsertRes.error.message,
            },
          });
        default:
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: upsertRes.error.message,
            },
          });
      }
    }

    return ctx.json(upsertRes.value);
  }
);

export default app;
