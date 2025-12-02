import type { HeartbeatMCPResponseType } from "@dust-tt/client";
import { PublicHeartbeatMCPRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { updateMCPServerHeartbeat } from "@app/lib/api/actions/mcp/client_side_registry";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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
async function handler(
  req: NextApiRequest,
  // eslint-disable-next-line dust/enforce-client-types-in-public-api
  res: NextApiResponse<WithAPIErrorResponse<HeartbeatMCPResponseType>>,
  auth: Authenticator
): Promise<void> {
  const r = PublicHeartbeatMCPRequestBodySchema.safeParse(req.body);
  if (r.error) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const { serverId } = r.data;

  // Update the heartbeat for the server.
  const result = await updateMCPServerHeartbeat(auth, {
    workspaceId: auth.getNonNullableWorkspace().sId,
    serverId,
  });

  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "mcp_server_connection_not_found",
        message: "MCP server not registered or expired",
      },
    });
  }

  res.status(200).json(result);
}

export default withPublicAPIAuthentication(handler);
