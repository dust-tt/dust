import apiConfig from "@app/lib/api/config";
import { upsertDocument } from "@app/lib/api/data_sources";
import { isManaged, isWebsite } from "@app/lib/data_sources";
import logger from "@app/logger/logger";
import { PostDataSourceDocumentRequestBodySchema } from "@app/types/api/public/data_sources";
import { CoreAPI } from "@app/types/core/core_api";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withDataSource } from "@front-api/middleware/with_data_source";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";

// Mounted at /api/w/:wId/spaces/:spaceId/data_sources/:dsId/documents/:documentId.
const app = new Hono();

app.patch(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  validate("json", PostDataSourceDocumentRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");
    const documentId = ctx.req.param("documentId") ?? "";

    if (!dataSource.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "data_source_auth_error",
          message: "You are not allowed to update data in this data source.",
        },
      });
    }

    if (isManaged(dataSource) || isWebsite(dataSource)) {
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
    } = ctx.req.valid("json");

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

    return ctx.json({ document: upsertResult.value.document });
  }
);

app.delete(
  "/",
  withSpace({ requireCanRead: true }),
  withDataSource({ requireCanRead: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const dataSource = ctx.get("dataSource");
    const documentId = ctx.req.param("documentId") ?? "";

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
          message: "You cannot delete a document from a managed data source.",
        },
      });
    }

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const deleteRes = await coreAPI.deleteDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId,
    });
    if (deleteRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "There was an error deleting the document.",
        },
      });
    }

    return ctx.body(null, 204);
  }
);

export default app;
