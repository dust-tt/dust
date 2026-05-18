import { Hono } from "hono";

import { getFeatureFlags } from "@app/lib/auth";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";

export type GetWorkspaceFeatureFlagsResponseType = {
  feature_flags: WhitelistableFeature[];
};

export const featureFlagsApp = new Hono();

featureFlagsApp.get("/", async (c) => {
  const auth = c.get("auth");
  const feature_flags = await getFeatureFlags(auth);
  const body: GetWorkspaceFeatureFlagsResponseType = { feature_flags };
  return c.json(body);
});
