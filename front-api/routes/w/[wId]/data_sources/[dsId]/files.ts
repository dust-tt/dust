import { processAndUpsertToDataSource } from "@app/lib/api/files/upsert";
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
        type: "invalid_request_error",
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

  if (!dataSource.canWrite(auth)) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "data_source_auth_error",
        message: "You are not authorized to upsert to this data source.",
      },
    });
  }

  const rUpsert = await processAndUpsertToDataSource(auth, dataSource, {
    file,
    upsertArgs,
  });
  if (rUpsert.isErr()) {
    let status_code: number;
    let type: APIErrorType;

    switch (rUpsert.error.code) {
      case "connection_not_found":
      case "file_not_found":
      case "file_not_ready":
      case "invalid_content_error":
      case "invalid_csv_and_file":
      case "invalid_csv_content":
      case "invalid_file":
      case "invalid_url":
      case "missing_csv":
      case "table_not_found":
      case "title_too_long":
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

    return ctx.json(
      {
        error: {
          type,
          message: rUpsert.error.message,
        },
      },
      status_code as 400 | 413 | 500
    );
  }

  return ctx.json({ file: file.toPublicJSON(auth) });
});

export default app;
