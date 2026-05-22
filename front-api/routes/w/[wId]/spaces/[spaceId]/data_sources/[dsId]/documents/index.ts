import { upsertDocument } from "@app/lib/api/data_sources";
import { PostDataSourceDocumentRequestBodySchema } from "@app/types/api/public/data_sources";
import type { CoreAPILightDocument } from "@app/types/core/data_source";
import type { DocumentType } from "@app/types/document";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withDataSource } from "@front-api/middlewares/with_data_source";
import { withSpace } from "@front-api/middlewares/with_space";

import documentId from "./[documentId]";

export type PostDocumentResponseBody = {
  document: DocumentType | CoreAPILightDocument;
};

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/documents.
const app = workspaceApp();

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  validate("json", PostDataSourceDocumentRequestBodySchema),
  async (ctx): HandlerResult<PostDocumentResponseBody> => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");

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

    const {
      source_url,
      text,
      section,
      tags,
      parent_id,
      parents,
      timestamp,
      light_document_output,
      mime_type,
      title,
      document_id,
    } = ctx.req.valid("json");

    const upsertResult = await upsertDocument({
      // Use document_id if provided (slugified for LLM-friendly node IDs),
      // otherwise fall back to title for backwards compatibility.
      document_id: document_id ?? title,
      source_url,
      text,
      section,
      tags,
      parent_id,
      parents,
      timestamp,
      light_document_output,
      mime_type,
      title,
      dataSource,
      auth,
    });

    if (upsertResult.isErr()) {
      switch (upsertResult.error.code) {
        case "data_source_quota_error":
          return apiError(ctx, {
            status_code: 401,
            api_error: {
              type: "data_source_quota_error",
              message: upsertResult.error.message,
            },
          });
        case "invalid_url":
        case "text_or_section_required":
        case "invalid_parent_id":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: upsertResult.error.message,
            },
          });
        default:
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "There was an error upserting the document.",
            },
          });
      }
    }

    return ctx.json({ document: upsertResult.value.document }, 201);
  }
);

app.route("/:documentId", documentId);

export default app;
