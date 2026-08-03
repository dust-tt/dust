import type { GetExtensionConfigResponseBody } from "@app/lib/resources/extension";
import { ExtensionConfigurationResource } from "@app/lib/resources/extension";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/extension/config.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/extension/config:
 *   get:
 *     summary: Get extension configuration
 *     description: Returns the extension configuration for the workspace, including blacklisted domains.
 *     tags:
 *       - Private Extension
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
 *         description: Extension configuration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PrivateExtensionConfig'
 *       401:
 *         description: Unauthorized
 */

app.get("/", async (ctx): HandlerResult<GetExtensionConfigResponseBody> => {
  const auth = ctx.get("auth");

  const config = await ExtensionConfigurationResource.fetchForWorkspace(auth);

  return ctx.json({
    blacklistedDomains: config?.blacklistedDomains ?? [],
  });
});

export default app;
