import { ModelTierResource } from "@app/lib/resources/model_tier_resource";
import type { ListModelTierOverridesResponseBody } from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/model_tiers/groups.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<ListModelTierOverridesResponseBody> => {
    const auth = ctx.get("auth");
    const tiers = await ModelTierResource.listGroupTiers(auth);
    return ctx.json({ tiers });
  }
);

export default app;
