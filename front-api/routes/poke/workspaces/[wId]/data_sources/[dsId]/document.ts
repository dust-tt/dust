import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { CoreAPIDocument } from "@app/types/core/data_source";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

export type PokeGetDocument = {
  document: CoreAPIDocument;
};

const QuerySchema = z.object({
  documentId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/document.
const app = pokeWorkspaceApp();

app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeGetDocument> => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId");
    if (!dsId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid data source ID.",
        },
      });
    }
    const { documentId } = ctx.req.valid("query");

    const dataSource = await DataSourceResource.fetchById(auth, dsId, {
      includeEditedBy: true,
    });

    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "Data source not found.",
        },
      });
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const documentResult = await coreAPI.getDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId,
    });

    if (documentResult.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_document_not_found",
          message: "Document not found.",
        },
      });
    }

    return ctx.json({ document: documentResult.value.document });
  }
);

export default app;
