import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { FileType } from "@app/types/files";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type RenameFileResponseBody = {
  file: FileType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<RenameFileResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { fileId } = req.query;
  if (!isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing fileId query parameter.",
      },
    });
  }

  const file = await FileResource.fetchById(auth, fileId);
  if (!file) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  }

  // Check feature flag for project_context files
  if (file.useCase === "project_context") {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    if (!featureFlags.includes("projects")) {
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Feature not supported",
        },
      });
    }
  }

  // Get space for permission checks
  let space: SpaceResource | null = null;
  if (file.useCaseMetadata?.spaceId) {
    space = await SpaceResource.fetchById(auth, file.useCaseMetadata.spaceId);
  }

  switch (req.method) {
    case "PATCH": {
      // Check permissions for renaming
      if (file.useCase === "project_context") {
        if (!space || !space.canWrite(auth)) {
          return apiError(req, res, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: "You cannot edit files in that space.",
            },
          });
        }
      } else if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message:
              "Only users that are `builders` for the current workspace can modify files.",
          },
        });
      }

      const { fileName } = req.body;
      if (!isString(fileName) || fileName.trim() === "") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "fileName is required and must be a non-empty string.",
          },
        });
      }

      await file.rename(fileName.trim());

      return res.status(200).json({ file: file.toJSON(auth) });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
