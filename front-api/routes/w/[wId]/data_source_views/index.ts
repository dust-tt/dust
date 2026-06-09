import type { GetDataSourceViewsResponseBody } from "@app/lib/api/data_source_view";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import tags from "./tags";

// Mounted under /api/w/:wId/data_source_views.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetDataSourceViewsResponseBody> => {
  const auth = ctx.get("auth");
  const dataSourceViews = await DataSourceViewResource.listByWorkspace(auth);
  return ctx.json({
    dataSourceViews: dataSourceViews.map((dsv) => dsv.toJSON()),
  });
});

app.route("/tags", tags);

export default app;
