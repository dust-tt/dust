import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import type { DocumentType } from "@app/types/document";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const QuerySchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional().default(10),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

export type PokeGetDocumentsResponseBody = {
  documents: DocumentType[];
  total: number;
};

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/documents.
const app = pokeApp();

app.get(
  "/",
  validate("query", QuerySchema),
  async (ctx): HandlerResult<PokeGetDocumentsResponseBody> => {
    const auth = ctx.get("auth");
    const dsId = ctx.req.param("dsId") ?? "";
    const { limit, offset } = ctx.req.valid("query");

    const dataSource = await DataSourceResource.fetchById(auth, dsId);
    if (!dataSource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      });
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const documents = await coreAPI.getDataSourceDocuments(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      },
      { limit, offset }
    );

    if (documents.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "internal_server_error",
          message:
            "We encountered an error while fetching the data source documents.",
          data_source_error: documents.error,
        },
      });
    }

    return ctx.json({
      documents: documents.value.documents,
      total: documents.value.total,
    });
  }
);

export default app;
