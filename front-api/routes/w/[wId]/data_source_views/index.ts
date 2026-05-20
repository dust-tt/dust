import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { Hono } from "hono";

import tags from "./tags";

// Mounted under /api/w/:wId/data_source_views.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  return ctx.json({
    dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
  });
});

app.route("/tags", tags);

export default app;
