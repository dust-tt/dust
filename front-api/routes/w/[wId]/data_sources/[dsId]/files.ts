import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import type { APIErrorType } from "@app/types/error";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/w/:wId/data_sources/:dsId/files.
const app = workspaceApp();

/** @ignoreswagger */
app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { dsId } = ctx.req.valid("param");

  const body = await ctx.req.json().catch(() => ({}));
  const { fileId, upsertArgs } = body;

  // Get file and make sure that it is within the same workspace.
  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Only folder document and table upserts are supported on this endpoint.
  if (
    !["upsert_document", "upsert_table", "folders_document"].includes(
      file.useCase
    )
  ) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "data_source_file_use_case_not_supported",
        message:
          "Only folder document and table upserts are supported on this endpoint.",
      },
    });
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: `Could not find data source with id ${dsId}`,
      },
    });
  }

  if (!auth.can("write", dataSource)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to upsert to this data source.",
      },
    });
  }

  if (isManaged(dataSource) || isWebsite(dataSource)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You cannot upload a file to a managed data source.",
      },
    });
  }

  const rUpsert = await processAndUpsertToDataSource(auth, dataSource, {
    file,
    upsertArgs,
  });
  if (rUpsert.isErr()) {
    let status_code: 400 | 413 | 500;
    let type: APIErrorType;

    switch (rUpsert.error.code) {
      case "connection_not_found":
        status_code = 400;
        type = "connector_not_found_error";
        break;

      case "file_not_found":
        status_code = 400;
        type = "file_not_found";
        break;

      case "file_not_ready":
        status_code = 400;
        type = "data_source_file_not_ready";
        break;

      case "invalid_file":
        status_code = 400;
        type = "file_type_not_supported";
        break;

      case "invalid_content_error":
      case "invalid_csv_content":
        status_code = 400;
        type = "table_file_content_invalid";
        break;

      case "table_not_found":
        status_code = 400;
        type = "table_not_found";
        break;

      case "title_too_long":
        status_code = 400;
        type = "node_title_too_long";
        break;

      // Upsert arguments that fail validation.
      case "invalid_csv_and_file":
      case "invalid_url":
      case "missing_csv":
        status_code = 400;
        type = "invalid_request_error";
        break;

      case "data_source_quota_error":
        status_code = 413;
        type = "data_source_quota_error";
        break;

      default:
        status_code = 500;
        type = "internal_server_error";
        break;
    }

    return apiError(ctx, {
      status_code,
      api_error: {
        type,
        message: rUpsert.error.message,
      },
    });
  }

  return ctx.json({ file: file.toPublicJSON(auth) });
});

export default app;
