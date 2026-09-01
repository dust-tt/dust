import {
  listGroupAllowedTierNames,
  listUserAllowedTierNames,
  listWorkspaceMaxAllowedTierName,
} from "@app/lib/model_tiers/allowed_tiers";
import type { GetPokeAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/model_tiers/allowed.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetPokeAllowedModelTiersResponseBody> => {
    const auth = ctx.get("auth");

    const [users, groups, maxTierName] = await Promise.all([
      listUserAllowedTierNames(auth),
      listGroupAllowedTierNames(auth),
      listWorkspaceMaxAllowedTierName(auth),
    ]);

    return ctx.json({ users, groups, maxTierName });
  }
);

export default app;
