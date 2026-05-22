import type { CheckStuckResponseBody } from "@app/lib/api/data_sources/check_stuck";
import { checkConnectorStuckForDataSource } from "@app/lib/api/data_sources/check_stuck";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type { CheckStuckResponseBody as PokeCheckStuckResponseBody };

// Mounted at /api/poke/workspaces/:wId/data_sources/:dsId/check-stuck.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<CheckStuckResponseBody> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId") ?? "";

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
});

export default app;
