import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { upsertDocument } from "@app/lib/api/data_sources";
import { PostDataSourceDocumentRequestBodySchema } from "@app/types/api/public/data_sources";

import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

import documentId from "./[documentId]";

// Mounted under /api/w/:wId/spaces/:spaceId/data_sources/:dsId/documents.
const app = new Hono();

app.post(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  validate("json", PostDataSourceDocumentRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");

    if (!dataSource.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    if (dataSource.connectorId) {
      return apiError(c, {
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
    } = c.req.valid("json");

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
          return apiError(c, {
            status_code: 401,
            api_error: {
              type: "data_source_quota_error",
              message: upsertResult.error.message,
            },
          });
        case "invalid_url":
        case "text_or_section_required":
        case "invalid_parent_id":
          return apiError(c, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: upsertResult.error.message,
            },
          });
        default:
          return apiError(c, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "There was an error upserting the document.",
            },
          });
      }
    }

    return c.json({ document: upsertResult.value.document }, 201);
  }
);

app.route("/:documentId", documentId);

export default app;
