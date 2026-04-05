/** @ignoreswagger */
import config from "@app/lib/api/config";
import { getShareTokenRegionRedirectUrl } from "@app/lib/api/regions/lookup";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isInteractiveContentType } from "@app/types/files";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetShareFrameMetadataResponseBody {
  requiresEmailVerification: boolean;
  shareUrl: string;
  title: string;
  vizUrl: string;
  workspaceId: string;
  workspaceName: string;
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

  const result = await FileResource.fetchByShareToken(token);
  if (result.isErr()) {
    if (result.error.code === "file_not_found") {
      const redirectUrl = await getShareTokenRegionRedirectUrl({ requestUrl: req.url ?? "", token });
      if (redirectUrl) {
        res.redirect(307, redirectUrl);
        return;
      }
    }

    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { file, shareScope } = result.value;

  // Only allow Frame files.
  if (!isInteractiveContentType(file.contentType)) {
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

  // Only show the email verification form if the scope supports email invites AND there are active
  // grants.
  const isEmailScope =
    shareScope === "emails_only" || shareScope === "workspace_and_emails";
  const hasActiveGrants = isEmailScope
    ? (await file.listActiveSharingGrants()).length > 0
    : false;
  const requiresEmailVerification = isEmailScope && hasActiveGrants;

  res.status(200).json({
    requiresEmailVerification,
    shareUrl,
    title: file.fileName,
    vizUrl: config.getVizPublicUrl(),
    workspaceId: workspace.sId,
    workspaceName: workspace.name,
  });
}

export default withLogging(handler);
