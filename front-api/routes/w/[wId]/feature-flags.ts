import { getFeatureFlags } from "@app/lib/auth";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { workspaceApp } from "@front-api/middlewares/ctx";

export type GetWorkspaceFeatureFlagsResponseType = {
  feature_flags: WhitelistableFeature[];
};

// Mounted at /api/w/:wId/feature-flags.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/feature-flags:
 *   get:
 *     summary: Get workspace feature flags
 *     description: Returns the list of enabled feature flags for the workspace.
 *     tags:
 *       - Private Workspace
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of feature flags
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PrivateFeatureFlags'
 *       401:
 *         description: Unauthorized
 */

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const feature_flags = await getFeatureFlags(auth);
  const body: GetWorkspaceFeatureFlagsResponseType = { feature_flags };
  return ctx.json(body);
});

export default app;
