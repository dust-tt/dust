import { dataSourceViewToPokeJSON } from "@app/lib/poke/utils";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { PokeDataSourceViewType } from "@app/types/poke";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PokeGetDataSourceViewDetails = {
  dataSourceView: PokeDataSourceViewType;
};

const ParamsSchema = z.object({
  dsvId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/data_source_views/:dsvId/details.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetDataSourceViewDetails> => {
    const auth = ctx.get("auth");
    const { dsvId } = ctx.req.valid("param");

    const dataSourceView = await DataSourceViewResource.fetchById(auth, dsvId, {
      includeEditedBy: true,
    });

    if (!dataSourceView) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "data_source_view_not_found",
          message: "Data source view not found.",
        },
      });
    }

    const dataSourceViewJSON = await dataSourceViewToPokeJSON(dataSourceView);

    return ctx.json({ dataSourceView: dataSourceViewJSON });
  }
);

export default app;
