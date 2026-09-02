import type { PokeListFrameFunctions } from "@app/lib/api/poke/frames";
import { listFrameFunctions } from "@app/lib/api/poke/frames";
import { pokeFrameApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import functionId from "./[functionId]";

// Mounted at /api/poke/workspaces/:wId/frames/:frameId/functions.
const app = pokeFrameApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeListFrameFunctions> => {
  const auth = ctx.get("auth");
  const frame = ctx.get("frame");

  return ctx.json({ items: await listFrameFunctions(auth, frame) });
});

app.route("/:functionId", functionId);

export default app;
