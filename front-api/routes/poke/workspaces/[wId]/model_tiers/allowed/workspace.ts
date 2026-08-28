import { listWorkspaceMaxAllowedTierName } from "@app/lib/model_tiers/allowed_tiers";
import type { GetWorkspaceAllowedModelTiersResponseBody } from "@app/types/api/model_tiers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/model_tiers/allowed/workspace.
// Read-only: Poke's Pool Usage page only displays the models tier column, it
// never edits it — see /api/w/:wId/model_tiers/allowed/workspace for the
// mutable customer-facing version.
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
