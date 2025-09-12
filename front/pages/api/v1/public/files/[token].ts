import type { PublicFileResponseBodyType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { isSessionWithUserFromWorkspace } from "@app/lib/api/auth_wrappers";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get a file by its public share token.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicFileResponseBodyType>>
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

  const { token } = req.query;
  if (typeof token !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing token parameter.",
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

  const { file, content: fileContent, shareScope } = result;

  // Only allow conversation Content Creation files.
  if (!file.isContentCreation) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Content Creation files can be shared publicly.",
      },
    });
  }

  // Check if file is safe to display.
  if (!file.isSafeToDisplay()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

  // If the share scope is "none", the file should not be accessible to anyone.
  if (shareScope === "none") {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "You cannot access this file.",
      },
    });
  }

  // For workspace sharing, check authentication.
  // conversation_participants is now treated as workspace scope
  if (
    shareScope === "workspace" ||
    shareScope === "conversation_participants"
  ) {
    const isWorkspaceUser = await isSessionWithUserFromWorkspace(
      req,
      res,
      workspace.sId
    );

    if (!isWorkspaceUser) {
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "file_not_found",
          message: "File not found.",
        },
      });
    }
  }

  res.status(200).json({
    content: fileContent,
    file: file.toJSON(),
  });
}

export default handler;
