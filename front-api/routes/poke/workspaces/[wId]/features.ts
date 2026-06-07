import type { GetPokeFeaturesResponseBody } from "@app/lib/api/poke/features";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/features.
const app = pokeApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetPokeFeaturesResponseBody> => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const flags = await FeatureFlagResource.listForWorkspace(owner);

  const features = flags.map((f) => ({
    name: f.name,
    createdAt: f.createdAt.toISOString(),
  }));

  return ctx.json({ features });
});

export default app;
