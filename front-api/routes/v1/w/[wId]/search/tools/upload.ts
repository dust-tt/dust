import {
  downloadAndUploadToolFile,
  getToolAccessToken,
} from "@app/lib/search/tools/search";
import type { FileUploadedRequestResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const SearchToolsUploadBodySchema = z.object({
  serverViewId: z.string().min(1, "serverViewId parameter is required."),
  externalId: z.string().min(1, "externalId parameter is required."),
  conversationId: z.string().optional(),
  serverName: z.string().optional(),
  serverIcon: z.string().optional(),
});

// Mounted at /api/v1/w/:wId/search/tools/upload.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/search/tools/upload:
 *   post:
 *     summary: Upload a tool file
 *     description: Download and upload a file from a tool (MCP server) to Dust
 *     tags:
 *       - Search
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - serverViewId
 *               - externalId
 *             properties:
 *               serverViewId:
 *                 type: string
 *                 description: The MCP server view ID
 *               externalId:
 *                 type: string
 *                 description: The external ID of the file in the tool
 *               conversationId:
 *                 type: string
 *                 description: Optional conversation ID for context
 *               serverName:
 *                 type: string
 *                 description: Optional name of the MCP server (e.g., "Notion", "GitHub")
 *               serverIcon:
 *                 type: string
 *                 description: Optional icon identifier for the MCP server
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
app.post(
  "/",
  validate("json", SearchToolsUploadBodySchema),
  async (ctx): HandlerResult<FileUploadedRequestResponseType> => {
    const auth = ctx.get("auth");
    const { serverViewId, externalId, conversationId, serverName, serverIcon } =
      ctx.req.valid("json");

    const tokenResult = await getToolAccessToken({ auth, serverViewId });
    if (tokenResult.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: tokenResult.error.message,
        },
      });
    }

    const { tool, accessToken, metadata } = tokenResult.value;
    const result = await downloadAndUploadToolFile({
      auth,
      tool,
      accessToken,
      externalId,
      useCase: "conversation",
      useCaseMetadata: {
        conversationId,
      },
      metadata,
      serverName,
      serverIcon,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({
      file: result.value,
    });
  }
);

export default app;
