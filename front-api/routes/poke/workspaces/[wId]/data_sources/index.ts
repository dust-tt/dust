import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { PokeListDataSources } from "@app/types/api/poke/data_sources";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import dsId from "./[dsId]";

// Mounted at /api/poke/workspaces/:wId/data_sources.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListDataSources> => {
  const auth = ctx.get("auth");

  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeEditedBy: true,
  });

  return ctx.json({ data_sources: dataSources.map((ds) => ds.toJSON()) });
});

app.route("/:dsId", dsId);

export default app;
