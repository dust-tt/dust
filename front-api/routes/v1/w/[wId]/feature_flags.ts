import type { GetWorkspaceFeatureFlagsResponseType } from "@dust-tt/client";
import { Hono } from "hono";

import { getFeatureFlags } from "@app/lib/auth";

// Re-exported so consumers can import the response type from the route
// file, matching the convention of our other migrated routes.
export type { GetWorkspaceFeatureFlagsResponseType } from "@dust-tt/client";

// Mounted at /api/v1/w/:wId/feature_flags.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isSystemKey()) {
    return c.json(
      {
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      },
      404
    );
  }

  const feature_flags = await getFeatureFlags(auth);
  const body: GetWorkspaceFeatureFlagsResponseType = { feature_flags };
  return c.json(body);
});

export default app;
