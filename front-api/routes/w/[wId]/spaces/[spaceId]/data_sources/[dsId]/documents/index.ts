import { Hono } from "hono";

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
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message: "You are not allowed to update data in this data source.",
          },
        },
        403
      );
    }

    if (dataSource.connectorId) {
      return c.json(
        {
          error: {
            type: "data_source_auth_error",
            message: "You cannot upsert a document on a managed data source.",
          },
        },
        403
      );
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
          return c.json(
            {
              error: {
                type: "data_source_quota_error",
                message: upsertResult.error.message,
              },
            },
            401
          );
        case "invalid_url":
        case "text_or_section_required":
        case "invalid_parent_id":
          return c.json(
            {
              error: {
                type: "invalid_request_error",
                message: upsertResult.error.message,
              },
            },
            400
          );
        default:
          return c.json(
            {
              error: {
                type: "internal_server_error",
                message: "There was an error upserting the document.",
              },
            },
            500
          );
      }
    }

    return c.json({ document: upsertResult.value.document }, 201);
  }
);

app.route("/:documentId", documentId);

export default app;
