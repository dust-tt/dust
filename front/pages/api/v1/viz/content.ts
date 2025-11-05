import type { PublicVizContentResponseBodyType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { verifyVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { frameContentType } from "@app/types";

/**
 * @ignoreswagger
 *
 * Undocumented generic viz content endpoint that accepts access tokens for any content type.
 * The access token determines what content to return and user permissions.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicVizContentResponseBodyType>>
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only GET method is supported.",
      },
    });
  }

  // Extract and validate access token from Authorization header.
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: "Authorization header required.",
      },
    });
  }

  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: "Authorization header must use Bearer token format.",
      },
    });
  }

  const accessToken = authHeader.substring(bearerPrefix.length).trim();
  if (!accessToken) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: "Access token is required.",
      },
    });
  }

  const tokenPayload = verifyVizAccessToken(accessToken);
  if (!tokenPayload) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: "Invalid or expired access token.",
      },
    });
  }

  const { fileToken, contentType } = tokenPayload;

  const result = await FileResource.fetchByShareTokenWithContent(fileToken);
  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "Content not found.",
      },
    });
  }

  // Handle different content types.
  if (contentType === frameContentType) {
    if (!result.file.isInteractiveContent) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Requested content is not an interactive frame.",
        },
      });
    }

    return res.status(200).json({
      content: result.content,
      contentType: frameContentType,
      metadata: {
        conversationId: result.file.useCaseMetadata?.conversationId,
      },
    });
  } else {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Unsupported content type: ${contentType}`,
      },
    });
  }
}

export default withLogging(handler);
