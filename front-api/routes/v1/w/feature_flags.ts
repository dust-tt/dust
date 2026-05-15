import type { GetWorkspaceFeatureFlagsResponseType } from "@dust-tt/client";
import { Hono } from "hono";

import { getFeatureFlags } from "@app/lib/auth";

export const publicFeatureFlagsApp = new Hono();

publicFeatureFlagsApp.get("/", async (c) => {
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
