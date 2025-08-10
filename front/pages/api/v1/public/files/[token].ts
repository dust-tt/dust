import type { FileType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { isSessionWithUserFromWorkspace } from "@app/lib/api/auth_wrappers";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export interface PublicFileResponseBody {
  content?: string;
  file: FileType;
}

/**
 * @ignoreswagger
 *
 * Undocumented API endpoint to get a file by its public share token.
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PublicFileResponseBody>>
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

  // Only allow conversation interactive files.
  if (!file.isInteractive) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only interactive content files can be shared publicly.",
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

  // This endpoint does not support conversation participants sharing. It goes through the private
  // API endpoint instead.
  if (shareScope === "conversation_participants") {
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
