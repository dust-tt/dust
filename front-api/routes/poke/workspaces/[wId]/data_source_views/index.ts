import { getDataSourceViewUsage } from "@app/lib/api/agent_data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { AgentsUsageType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

import dsvId from "./[dsvId]";

export type DataSourceViewWithUsage = DataSourceViewType & {
  usage: AgentsUsageType | null;
};

export type PokeListDataSourceViews = {
  data_source_views: DataSourceViewWithUsage[];
};

// Mounted at /api/poke/workspaces/:wId/data_source_views.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeListDataSourceViews> => {
  const auth = ctx.get("auth");

  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth, {
    includeEditedBy: true,
  });

  const dataSourceViewsWithUsage = await concurrentExecutor(
    dataSourceViews,
    async (dsv) => {
      const usageResult = await getDataSourceViewUsage({
        auth,
        dataSourceView: dsv,
      });
      return {
        ...dsv.toJSON(),
        usage: usageResult.isOk() ? usageResult.value : null,
      };
    },
    { concurrency: 4 }
  );

  return ctx.json({ data_source_views: dataSourceViewsWithUsage });
});

app.route("/:dsvId", dsvId);

export default app;
