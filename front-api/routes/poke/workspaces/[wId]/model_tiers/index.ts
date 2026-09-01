import type { GetModelTiersResponseBody } from "@app/types/api/model_tiers";
import { listTiers } from "@app/types/assistant/models/model_tiers";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

import allowed from "./allowed";

// Mounted at /api/poke/workspaces/:wId/model_tiers. Read-only mirror of
// /api/w/:wId/model_tiers for the Poke Pool Usage page's models tier column.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetModelTiersResponseBody> => {
  const tiers = listTiers().map((tier) => ({
    name: tier.name,
    id: tier.id,
    description: tier.description,
  }));

  return ctx.json({ tiers });
});

app.route("/allowed", allowed);

export default app;
