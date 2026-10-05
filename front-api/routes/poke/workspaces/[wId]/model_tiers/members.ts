import type { PokeGetMemberModelTiers } from "@app/lib/api/poke/model_tiers";
import { getPokeMemberModelTiers } from "@app/lib/api/poke/model_tiers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/model_tiers/members.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<PokeGetMemberModelTiers> => {
  const auth = ctx.get("auth");

  return ctx.json(await getPokeMemberModelTiers(auth));
});

export default app;
