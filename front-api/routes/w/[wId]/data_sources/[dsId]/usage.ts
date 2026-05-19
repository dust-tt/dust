import { Hono } from "hono";

import { getDataSourceUsage } from "@app/lib/api/agent_data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";

// Mounted at /api/w/:wId/data_sources/:dsId/usage.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dsId = c.req.param("dsId") ?? "";

  const dataSource = await DataSourceResource.fetchById(auth, dsId);
  if (!dataSource || !dataSource.canRead(auth)) {
    return c.json(
      {
        error: {
          type: "data_source_not_found",
          message: "The data source you requested was not found.",
        },
      },
      404
    );
  }

  const usage = await getDataSourceUsage({ auth, dataSource });
  if (usage.isErr()) {
    return c.json(
      {
        error: {
          type: "internal_server_error",
          message: "Failed to get data source usage.",
        },
      },
      500
    );
  }

  return c.json({ usage: usage.value });
});

export default app;
