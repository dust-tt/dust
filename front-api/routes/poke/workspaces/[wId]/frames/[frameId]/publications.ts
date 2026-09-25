import type { PokeListFramePublications } from "@app/lib/api/poke/frames";
import { listFramePublications } from "@app/lib/api/poke/frames";
import { pokeFrameApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/frames/:frameId/publications.
const app = pokeFrameApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListFramePublications> => {
  const auth = ctx.get("auth");
  const frame = ctx.get("frame");

  return ctx.json({ items: await listFramePublications(auth, frame) });
});

export default app;
