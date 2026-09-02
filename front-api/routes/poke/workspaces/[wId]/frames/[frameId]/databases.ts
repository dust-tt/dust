import type { PokeListFrameDatabases } from "@app/lib/api/poke/frames";
import { listFrameDatabases } from "@app/lib/api/poke/frames";
import { pokeFrameApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/frames/:frameId/databases.
const app = pokeFrameApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListFrameDatabases> => {
  const auth = ctx.get("auth");
  const frame = ctx.get("frame");

  const result = await listFrameDatabases(auth, frame);
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: `Failed to list Frame databases: ${result.error.message}`,
      },
    });
  }

  return ctx.json({ items: result.value });
});

export default app;
