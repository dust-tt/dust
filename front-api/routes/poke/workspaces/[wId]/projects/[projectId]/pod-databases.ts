import type { PokeListProjectPodDatabases } from "@app/lib/api/poke/projects";
import { listDatabasesOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { pokeProjectApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/pod-databases.
const app = pokeProjectApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListProjectPodDatabases> => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  // There is no database-backed record of pod databases: the only source of truth is the live
  // `{db}.db` files in the pod, so this runs `dsbx db list` and wakes (or cold starts) the pod
  // sandbox. Poke fetches it on demand only.
  const result = await listDatabasesOnSandbox(auth, { space });
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to list pod databases: ${result.error.message}`,
      },
    });
  }

  return ctx.json({ items: result.value });
});

export default app;
