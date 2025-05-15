import type { RegisterMCPResponseType } from "@dust-tt/client";
import { PublicRegisterMCPRequestBodySchema } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import {
  MCPServerInstanceLimitError,
  registerMCPServer,
} from "@app/lib/api/actions/mcp/client_side_registry";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @ignoreswagger
 * /api/v1/w/{wId}/mcp/register:
 *   post:
 *     summary: Register a local MCP server
 *     description: |
 *       Register a client-generated UUID for a local MCP server.
 *       The registration is scoped to the current user and workspace.
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
 *                 description: Client-generated UUID of the MCP server
 *     responses:
 *       200:
 *         description: Server registered successfully
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
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RegisterMCPResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "invalid_request_error",
        message: "Method not allowed.",
      },
    });
  }

  const r = PublicRegisterMCPRequestBodySchema.safeParse(req.body);
  if (r.error) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(r.error).toString(),
      },
    });
  }

  const { serverName } = r.data;

  // Register the server.
  const registration = await registerMCPServer(auth, {
    serverName,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

  if (registration.isErr()) {
    const error = registration.error;
    // Check if this is a server instance limit error.
    if (error instanceof MCPServerInstanceLimitError) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    }

    // Other errors are treated as server errors.
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: error.message,
      },
    });
  }

  res.status(200).json(registration.value);
}

export default withPublicAPIAuthentication(handler);
