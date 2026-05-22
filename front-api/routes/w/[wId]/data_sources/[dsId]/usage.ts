import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { AgentsUsageType } from "@app/types/data_source";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetDataSourceUsageResponseBody = {
  usage: AgentsUsageType;
};

// Mounted at /api/w/:wId/data_sources/:dsId/usage.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetDataSourceUsageResponseBody> => {
  const auth = ctx.get("auth");
  const dsId = ctx.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource || !dataSource.canRead(auth)) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The data source you requested was not found.",
      },
    });
  }

  const usage = await getDataSourceUsage({ auth, dataSource });
  if (usage.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to get data source usage.",
      },
    });
  }

  return ctx.json({ usage: usage.value });
});

export default app;
