/* eslint-disable dust/enforce-client-types-in-public-api */
import type { NextApiRequest, NextApiResponse } from "next";

import { verifyVizAccessToken } from "@app/lib/api/viz/access_tokens";
import { canAccessFileInConversation } from "@app/lib/api/viz/files";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { frameContentType, isString } from "@app/types";

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get files used in a vizualisation. This endpoint is only called
 * when rendering vizualisations with an access token.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<never>>
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

  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token or fileId parameter.",
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

  // Get file info using the fileToken from the access token.
  const result = await FileResource.fetchByShareTokenWithContent(
    tokenPayload.fileToken
  );
  if (!result) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(
    result.file.workspaceId
  );
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { file: frameFile, shareScope } = result;

  // If current share scope differs from token scope, reject. It means share scope changed.
  if (shareScope !== tokenPayload.shareScope) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Only allow conversation Frame files.
  if (
    !frameFile.isInteractiveContent ||
    frameFile.contentType !== frameContentType
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared publicly.",
      },
    });
  }

  // Check if file is safe to display.
  if (!frameFile.isSafeToDisplay()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  // If file is shared publicly, ensure workspace allows it.
  if (
    shareScope === "public" &&
    !workspace.canShareInteractiveContentPublicly
  ) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Frame must have a conversation context.
  const frameConversationId = frameFile.useCaseMetadata?.conversationId;
  if (!frameConversationId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Frame missing conversation context.",
      },
    });
  }

  // Load the requested file within the same workspace context.
  const owner = renderLightWorkspaceType({ workspace });

  const targetFile = await FileResource.unsafeFetchByIdInWorkspace(
    owner,
    fileId
  );
  if (!targetFile) {
    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const hasAccessRes = await canAccessFileInConversation(
    owner,
    targetFile,
    frameConversationId
  );

  if (hasAccessRes.isErr()) {
    logger.error(
      {
        erroor: hasAccessRes.error,
      },
      "Error checking file access in conversation"
    );

    return apiError(req, res, {
      status_code: 404,
      api_error: { type: "file_not_found", message: "File not found." },
    });
  }

  const readStream = targetFile.getSharedReadStream(owner, "original");
  readStream.on("error", () => {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });
  res.setHeader("Content-Type", targetFile.contentType);
  readStream.pipe(res);

  return;
}

export default handler;
