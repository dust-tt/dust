import { Hono } from "hono";

import apiConfig from "@app/lib/api/config";
import { upsertDocument } from "@app/lib/api/data_sources";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import { PostDataSourceDocumentRequestBodySchema } from "@app/types/api/public/data_sources";
import { CoreAPI } from "@app/types/core/core_api";

import { dataSourceResource } from "@front-api/middleware/data_source_resource";
import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

// Mounted at /api/w/:wId/spaces/:spaceId/data_sources/:dsId/documents/:documentId.
const app = new Hono();

app.patch(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  validate("json", PostDataSourceDocumentRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");
    const documentId = c.req.param("documentId") ?? "";

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

    if (isManaged(dataSource) || isWebsite(dataSource)) {
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
    } = c.req.valid("json");

    const upsertResult = await upsertDocument({
      document_id: documentId,
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

    return c.json({ document: upsertResult.value.document });
  }
);

app.delete(
  "/",
  spaceResource({ requireCanRead: true }),
  dataSourceResource({ requireCanRead: true }),
  async (c) => {
    const auth = c.get("auth");
    const dataSource = c.get("dataSource");
    const documentId = c.req.param("documentId") ?? "";

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
            message:
              "You cannot delete a document from a managed data source.",
          },
        },
        403
      );
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const deleteRes = await coreAPI.deleteDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId,
    });
    if (deleteRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: "There was an error deleting the document.",
          },
        },
        500
      );
    }

    return c.body(null, 204);
  }
);

export default app;
