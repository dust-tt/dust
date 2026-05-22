import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceType } from "@app/types/data_source";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

import dsId from "./[dsId]";

export type PokeListDataSources = {
  data_sources: DataSourceType[];
};

// Mounted at /api/poke/workspaces/:wId/data_sources.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeListDataSources> => {
  const auth = ctx.get("auth");

  const dataSources = await DataSourceResource.listByWorkspace(auth, {
    includeEditedBy: true,
  });

  return ctx.json({ data_sources: dataSources.map((ds) => ds.toJSON()) });
});

app.route("/:dsId", dsId);

export default app;
