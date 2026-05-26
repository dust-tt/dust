import {
  MCPServerInstanceLimitError,
  registerMCPServer,
} from "@app/lib/api/actions/mcp/client_side_registry";
import type { RegisterMCPResponseType } from "@dust-tt/client";
import { PublicRegisterMCPRequestBodySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @swagger
 * /api/v1/w/{wId}/mcp/register:
 *   post:
 *     summary: Register a client-side MCP server
 *     description: |
 *       [Documentation](https://docs.dust.tt/docs/client-side-mcp-server)
 *       Register a client-side MCP server to Dust.
 *       The registration is scoped to the current user and workspace.
 *       A serverId identifier is generated and returned in the response.
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
 *               - serverName
 *             properties:
 *               serverName:
 *                 type: string
 *                 description: Name of the MCP server
 *     responses:
 *       200:
 *         description: Server registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 serverId:
 *                   type: string
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

// Mounted at /api/v1/w/:wId/mcp/register.
const app = publicApiApp();

app.post(
  "/",
  validate("json", PublicRegisterMCPRequestBodySchema),
  async (ctx): HandlerResult<RegisterMCPResponseType> => {
    const auth = ctx.get("auth");

    if (auth.isKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "API keys are not allowed to register MCP servers.",
        },
      });
    }

    const { serverName } = ctx.req.valid("json");

    // Register the server.
    const registration = await registerMCPServer(auth, {
      serverName,
      workspaceId: auth.getNonNullableWorkspace().sId,
    });

    if (registration.isErr()) {
      const error = registration.error;
      // Check if this is a server instance limit error.
      if (error instanceof MCPServerInstanceLimitError) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: error.message,
          },
        });
      }

      // Other errors are treated as server errors.
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: error.message,
        },
      });
    }

    return ctx.json(registration.value);
  }
);

export default app;
