import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { isOfficeViewerCompatible } from "@app/lib/file_content_utils";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export interface OfficeViewerUrlResponseBody {
  signedUrl: string;
  viewerUrl: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<OfficeViewerUrlResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;

  if (typeof fileId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid file ID.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const fileResource = await FileResource.fetchById(auth, fileId);
  if (!fileResource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  const { useCase, useCaseMetadata } = fileResource;

  if (useCase !== "project_context") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Office viewer is only available for project files.",
      },
    });
  }

  const space = useCaseMetadata?.spaceId
    ? await SpaceResource.fetchById(auth, useCaseMetadata.spaceId)
    : null;

  if (!space || !space.isMember(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  if (!isOfficeViewerCompatible(fileResource.contentType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not compatible with Office viewer.",
      },
    });
  }

  const signedUrl = await fileResource.getSignedUrlForOfficeViewer(auth);
  const viewerUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(signedUrl)}`;

  return res.status(200).json({ signedUrl, viewerUrl });
}

export default withSessionAuthenticationForWorkspace(handler);
