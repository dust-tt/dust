import apiConfig from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { GetDocumentBlobResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  dsId: z.string(),
  documentId: z.string(),
});

/**
 * @ignoreswagger
 * Only used by connectors.
 */
const app = publicApiApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetDocumentBlobResponseType> => {
    const auth = ctx.get("auth");

    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const { dsId, documentId } = ctx.req.valid("param");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource || !dataSource.canRead(auth)) {
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

    const coreAPI = new CoreAPI(apiConfig.getCoreAPIConfig(), logger);
    const blobRes = await coreAPI.getDataSourceDocumentBlob({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId,
    });

    if (
      blobRes.isErr() &&
      blobRes.error.code === "data_source_document_not_found"
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_document_not_found",
          message: "The data source document you requested was not found.",
        },
      });
    }

    if (blobRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "data_source_error",
          message:
            "There was an error retrieving the data source document blob.",
          data_source_error: blobRes.error,
        },
      });
    }

    return ctx.json({
      blob: blobRes.value,
    });
  }
);

export default app;
