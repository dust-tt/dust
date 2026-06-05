import { listDataSourceViewsWithUsage } from "@app/lib/api/data_source_view";
import type { PokeListDataSourceViews } from "@app/lib/api/poke/data_source_views";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import dsvId from "./[dsvId]";

// Mounted at /api/poke/workspaces/:wId/data_source_views.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListDataSourceViews> => {
  const auth = ctx.get("auth");

  const dataSourceViewsWithUsage = await listDataSourceViewsWithUsage(auth);

  return ctx.json({ data_source_views: dataSourceViewsWithUsage });
});

app.route("/:dsvId", dsvId);

export default app;
