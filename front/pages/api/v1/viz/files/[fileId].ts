// @migration-status: MIGRATED_TO_HONO
/* eslint-disable dust/enforce-client-types-in-public-api */

import { extractAndVerifyVizAccessTokenFromHeader } from "@app/lib/api/viz/access_tokens";
import { assertVizFileAuthorized } from "@app/lib/api/viz/authorized_file_access";
import { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isInteractiveContentType } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

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

  const tokenRes = extractAndVerifyVizAccessTokenFromHeader(
    req.headers.authorization
  );
  if (tokenRes.isErr()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "workspace_auth_error",
        message: tokenRes.error,
      },
    });
  }
  const tokenPayload = tokenRes.value;

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

  const {
    file: frameFile,
    content: frameContent,
    shareScope,
    authorizedFileAccess,
  } = result;

  if (shareScope !== tokenPayload.shareScope) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  if (
    !frameFile.isInteractiveContent ||
    !isInteractiveContentType(frameFile.contentType)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Only Frame files can be shared publicly.",
      },
    });
  }

  if (!frameFile.isSafeToDisplay()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "File is not safe for public display.",
      },
    });
  }

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

  const authorizationMode = await assertVizFileAuthorized({
    authorizedFileAccess,
    requestedRef: fileId,
    owner,
    frameContent,
  });
  if (authorizationMode === "denied") {
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
}

export default handler;
