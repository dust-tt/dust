import { Hono } from "hono";

import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";

import tags from "./tags";

// Mounted under /api/w/:wId/data_source_views.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  return c.json({
    dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
  });
});

app.route("/tags", tags);

export default app;
