import config from "@app/lib/api/config";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import type { CoreAPITable } from "@app/types/core/core_api";
import { CoreAPI } from "@app/types/core/core_api";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type GetTablesResponseBody = {
  tables: Array<CoreAPITable>;
  total: number;
};

const QuerySchema = z.object({
  limit: z.coerce.number().int().nonnegative().optional().default(10),
  offset: z.coerce.number().int().nonnegative().optional().default(0),
});

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/tables.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (ctx): HandlerResult<GetTablesResponseBody> => {
    const auth = ctx.get("auth");
    const { dsId } = ctx.req.valid("param");

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

    const { limit, offset } = ctx.req.valid("query");

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tables = await coreAPI.getTables(
      {
        projectId: dataSource.dustAPIProjectId,
        dataSourceId: dataSource.dustAPIDataSourceId,
      },
      { limit, offset }
    );

    if (tables.isErr()) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "internal_server_error",
          message:
            "We encountered an error while fetching the data source tables.",
          data_source_error: tables.error,
        },
      });
    }

    return ctx.json({
      tables: tables.value.tables,
      total: tables.value.total,
    });
  }
);

export default app;
