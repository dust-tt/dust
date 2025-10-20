import type { PublicFrameResponseBodyType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAuthForSharedEndpointWorkspaceMembersOnly } from "@app/lib/api/auth_wrappers";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { frameContentType, isString } from "@app/types";

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get files used in a frame.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicFrameResponseBodyType>>
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

  const { token, fileId } = req.query;
  if (!isString(token) || !isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token or fileId parameter.",
      },
    });
  }

  const result = await FileResource.fetchByShareTokenWithContent(token);
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

  // Only allow conversation Frame files.
  if (
    !frameFile.isInteractiveContent &&
    frameFile.contentType === frameContentType
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

  // For workspace sharing, check authentication.
  if (shareScope === "workspace") {
    const auth = await getAuthForSharedEndpointWorkspaceMembersOnly(
      req,
      res,
      workspace.sId
    );
    if (!auth) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
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

  const { useCase, useCaseMetadata } = targetFile;
  const isSupportedUsecase =
    useCase === "tool_output" || useCase === "conversation";

  // Verify the file has a supported usecase and belongs to the same conversation as the frame.
  const canAccessFileThroughFrame =
    isSupportedUsecase &&
    useCaseMetadata?.conversationId === frameConversationId;
  if (!canAccessFileThroughFrame) {
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
