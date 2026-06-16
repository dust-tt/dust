import { deregisterMCPServer } from "@app/lib/api/actions/mcp/client_side_registry";
import { clearDustDesktopClientSideMCPServerRegistration } from "@app/lib/api/actions/mcp/dust_desktop";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PublicDeregisterMCPRequestBodySchema = z.object({
  serverId: z.string(),
});

// Mounted at /api/v1/w/:wId/mcp/deregister.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/mcp/deregister:
 *   post:
 *     summary: Deregister a client-side MCP server
 *     description: |
 *       [Documentation](https://docs.dust.tt/docs/client-side-mcp-server)
 *       Remove a previously registered client-side MCP server registration.
 *     tags:
 *       - MCP
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serverId
 *             properties:
 *               serverId:
 *                 type: string
 *                 description: The ID of the registered MCP server
 *     responses:
 *       200:
 *         description: Server deregistered successfully
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. User does not have access to the workspace.
 */
app.post(
  "/",
  validate("json", PublicDeregisterMCPRequestBodySchema),
  async (ctx): HandlerResult<{ success: true }> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("json");

    await deregisterMCPServer(auth, { serverId });
    await clearDustDesktopClientSideMCPServerRegistration(auth, { serverId });

    return ctx.json({ success: true as const });
  }
);

export default app;
