import type { FileUploadedRequestResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  downloadAndUploadToolFile,
  getToolAccessToken,
} from "@app/lib/search/tools/search";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

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
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       405:
 *         description: Method not allowed
 *       500:
 *         description: Internal server error
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileUploadedRequestResponseType>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST method is supported.",
      },
    });
  }

  const { serverViewId, externalId, conversationId } = req.body;

  if (typeof serverViewId !== "string" || serverViewId.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "serverViewId parameter is required.",
      },
    });
  }

  if (typeof externalId !== "string" || externalId.length < 1) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "externalId parameter is required.",
      },
    });
  }

  if (conversationId !== undefined && typeof conversationId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "conversationId must be a string.",
      },
    });
  }

  const tokenResult = await getToolAccessToken({ auth, serverViewId });
  if (tokenResult.isErr()) {
    return apiError(req, res, {
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
    conversationId,
    metadata,
  });

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }

  return res.status(200).json({
    file: result.value,
  });
}

export default withPublicAPIAuthentication(handler);
