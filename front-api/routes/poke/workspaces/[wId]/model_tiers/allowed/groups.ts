import { listGroupAllowedTierNames } from "@app/lib/model_tiers/allowed_tiers";
import type { GetGroupAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/model_tiers/allowed/groups.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetGroupAllowedModelTiersResponseBody> => {
    const auth = ctx.get("auth");

    const groups = await listGroupAllowedTierNames(auth);

    return ctx.json({ groups });
  }
);

export default app;
