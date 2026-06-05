import type { PokeListDataSources } from "@app/lib/api/poke/data_sources";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import dsId from "./[dsId]";

// Mounted at /api/poke/workspaces/:wId/data_sources.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListDataSources> => {
  const auth = ctx.get("auth");

  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeEditedBy: true,
  });

  return ctx.json({ data_sources: dataSources.map((ds) => ds.toJSON()) });
});

app.route("/:dsId", dsId);

export default app;
