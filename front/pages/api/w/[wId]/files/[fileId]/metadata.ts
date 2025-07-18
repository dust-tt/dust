import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { apiError } from "@app/logger/withlogging";
import type { FileType, WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<FileType>>,
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

  // TODO: Add a check on permissions/access to the file.
  switch (req.method) {
    case "GET":
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

      return res.status(200).json(fileResource.toJSON(auth));

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
