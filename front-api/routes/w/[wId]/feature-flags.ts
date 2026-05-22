import { getFeatureFlags } from "@app/lib/auth";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { workspaceApp } from "@front-api/middleware/env";

export type GetWorkspaceFeatureFlagsResponseType = {
  feature_flags: WhitelistableFeature[];
};

// Mounted at /api/w/:wId/feature-flags.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const feature_flags = await getFeatureFlags(auth);
  const body: GetWorkspaceFeatureFlagsResponseType = { feature_flags };
  return ctx.json(body);
});

export default app;
