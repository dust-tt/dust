import { getFeatureFlags } from "@app/lib/auth";
import type { GetWorkspaceFeatureFlagsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";

// Re-exported so consumers can import the response type from the route
// file, matching the convention of our other migrated routes.
export type { GetWorkspaceFeatureFlagsResponseType } from "@dust-tt/client";

// Mounted at /api/v1/w/:wId/feature_flags.
const app = publicApiApp();

app.get("/", ensureIsSystemKey(), async (ctx) => {
  const auth = ctx.get("auth");
  const feature_flags = await getFeatureFlags(auth);
  const body: GetWorkspaceFeatureFlagsResponseType = { feature_flags };
  return ctx.json(body);
});

export default app;
