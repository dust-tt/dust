import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetPokeFeaturesResponseBody = {
  features: {
    name: WhitelistableFeature;
    createdAt: string;
  }[];
};

// Mounted at /api/poke/workspaces/:wId/features.
const app = pokeWorkspaceApp();

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
