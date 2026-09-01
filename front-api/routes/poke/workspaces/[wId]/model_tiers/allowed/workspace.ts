import { listWorkspaceMaxAllowedTierName } from "@app/lib/model_tiers/allowed_tiers";
import type { GetWorkspaceAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/model_tiers/allowed/workspace.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetWorkspaceAllowedModelTiersResponseBody> => {
    const auth = ctx.get("auth");

    const maxTierName = await listWorkspaceMaxAllowedTierName(auth);

    return ctx.json({ maxTierName });
  }
);

export default app;
