import { checkConnectorStuckForDataSource } from "@app/lib/api/data_sources/check_stuck";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { CheckStuckResponseBody } from "@app/types/api/data_sources/check_stuck";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type { CheckStuckResponseBody as PokeCheckStuckResponseBody };

const ParamsSchema = z.object({
  dsId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/check-stuck.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<CheckStuckResponseBody> => {
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

    const result = await checkConnectorStuckForDataSource({
      connectorId: dataSource.connectorId,
      connectorProvider: dataSource.connectorProvider,
    });
    return ctx.json(result);
  }
);

export default app;
