import { validateMCPServerAccess } from "@app/lib/api/actions/mcp/client_side_registry";
import { publishMCPResults } from "@app/lib/api/assistant/mcp_events";
import type { PostMCPResultsResponseType } from "@dust-tt/client";
import { PublicPostMCPResultsRequestBodySchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @swagger
 * /api/v1/w/{wId}/mcp/results:
 *   post:
 *     summary: Submit MCP tool execution results
 *     description: |
 *       [Documentation](https://docs.dust.tt/docs/client-side-mcp-server)
 *       Endpoint for client-side MCP servers to submit the results of tool executions.
 *       This endpoint accepts the output from tools that were executed locally.
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
 *               - result
 *               - serverId
 *             properties:
 *               result:
 *                 type: object
 *                 description: The result data from the tool execution
 *               serverId:
 *                 type: string
 *                 description: ID of the MCP server submitting the results
 *     responses:
 *       200:
 *         description: Tool execution results successfully submitted
 *       400:
 *         description: Bad Request. Missing or invalid parameters.
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. You don't have access to this workspace or MCP server.
 *       404:
 *         description: Conversation or message not found.
 *       500:
 *         description: Internal Server Error.
 */

// Mounted at /api/v1/w/:wId/mcp/results.
const app = publicApiApp();

app.post(
  "/",
  validate("json", PublicPostMCPResultsRequestBodySchema),
  async (ctx): HandlerResult<PostMCPResultsResponseType> => {
    const auth = ctx.get("auth");
    const { result, serverId } = ctx.req.valid("json");

    const isValidAccess = await validateMCPServerAccess(auth, {
      serverId,
    });
    if (!isValidAccess) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "mcp_auth_error",
          message:
            "You don't have access to this MCP server or it has expired.",
        },
      });
    }

    // Publish MCP action results.
    await publishMCPResults(auth, {
      mcpServerId: serverId,
      result,
    });

    return ctx.json({
      success: true,
    });
  }
);

export default app;
