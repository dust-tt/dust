import type { PokeListProjectDatabases } from "@app/lib/api/poke/projects";
import { listDatabasesOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { pokeProjectApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

const app = pokeProjectApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListProjectDatabases> => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  // Project databases are the live SQLite files owned by the legacy Project sandbox. Frame-owned
  // databases live in each Frame's sandbox and are intentionally not included here.
  const result = await listDatabasesOnSandbox(auth, { space });
  if (result.isErr()) {
    return apiError(
      ctx,
      {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to list project databases: ${result.error.message}`,
        },
      },
      result.error
    );
  }

  return ctx.json({ items: result.value });
});

export default app;
