import { listTiers } from "@app/lib/api/assistant/token_pricing/tiers";
import type { GetModelTiersResponseBody } from "@app/types/api/model_tiers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

import allowed from "./allowed";

// Mounted at /api/w/:wId/model_tiers.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetModelTiersResponseBody> => {
    const tiers = listTiers().map((tier) => ({
      name: tier.name,
      id: tier.id,
      description: tier.description,
    }));

    return ctx.json({ tiers });
  }
);

app.route("/allowed", allowed);

export default app;
