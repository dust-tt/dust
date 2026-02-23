import config from "@app/lib/api/config";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { frameContentType } from "@app/types/files";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetShareFrameMetadataResponseBody {
  shareUrl: string;
  title: string;
  workspaceName: string;
  workspaceId: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetShareFrameMetadataResponseBody>>
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

  const { file, shareScope } = result;

  // Only allow Frame files.
  if (file.contentType !== frameContentType) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchByModelId(file.workspaceId);
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
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

  const shareUrl = `${config.getAppUrl()}/share/frame/${token}`;

  res.status(200).json({
    shareUrl,
    title: file.fileName,
    workspaceName: workspace.name,
    workspaceId: workspace.sId,
  });
}

export default withLogging(handler);
