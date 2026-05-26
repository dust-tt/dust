import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/client_side_registry";
import type { HeartbeatMCPResponseType } from "@dust-tt/client";
import { PublicHeartbeatMCPRequestBodySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @swagger
 * /api/v1/w/{wId}/mcp/heartbeat:
 *   post:
 *     summary: Update heartbeat for a client-side MCP server
 *     description: |
 *       [Documentation](https://docs.dust.tt/docs/client-side-mcp-server)
 *       Update the heartbeat for a previously registered client-side MCP server.
 *       This extends the TTL for the server registration.
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
 *         description: Heartbeat updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. User does not have access to the workspace.
 *       404:
 *         description: Not Found. MCP server not registered or expired.
 */

// Mounted at /api/v1/w/:wId/mcp/heartbeat.
const app = publicApiApp();

app.post(
  "/",
  validate("json", PublicHeartbeatMCPRequestBodySchema),
  async (ctx): HandlerResult<HeartbeatMCPResponseType> => {
    const auth = ctx.get("auth");
    const { serverId } = ctx.req.valid("json");

    // Update the heartbeat for the server.
    const result = await updateMCPServerHeartbeat(auth, {
      workspaceId: auth.getNonNullableWorkspace().sId,
      serverId,
    });

    if (!result) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "mcp_server_connection_not_found",
          message: "MCP server not registered or expired",
        },
      });
    }

    return ctx.json(result);
  }
);

export default app;
