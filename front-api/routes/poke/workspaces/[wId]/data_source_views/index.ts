import { listDataSourceViewsWithUsage } from "@app/lib/api/data_source_view";
import type { AgentsUsageType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

import dsvId from "./[dsvId]";

export type DataSourceViewWithUsage = DataSourceViewType & {
  usage: AgentsUsageType | null;
};

export type PokeListDataSourceViews = {
  data_source_views: DataSourceViewWithUsage[];
};

// Mounted at /api/poke/workspaces/:wId/data_source_views.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeListDataSourceViews> => {
  const auth = ctx.get("auth");

  const dataSourceViewsWithUsage = await listDataSourceViewsWithUsage(auth);

  return ctx.json({ data_source_views: dataSourceViewsWithUsage });
});

app.route("/:dsvId", dsvId);

export default app;
