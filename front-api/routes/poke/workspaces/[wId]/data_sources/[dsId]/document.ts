import config from "@app/lib/api/config";
import type { PokeGetDocument } from "@app/lib/api/poke/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  documentId: z.string(),
});

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/document.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeGetDocument> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");
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
