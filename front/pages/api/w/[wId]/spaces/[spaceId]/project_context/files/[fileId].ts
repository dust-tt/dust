/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { removeFileFromProject } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type DeleteProjectContextFileResponseBody = Record<string, never>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<DeleteProjectContextFileResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { spaceId, fileId } = req.query;
  if (!isString(spaceId) || !isString(fileId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid spaceId or fileId query parameter.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.canRead(auth)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  }

  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Only project spaces support project context knowledge removal.",
      },
    });
  }

  if (!space.canWrite(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You do not have write access to this project.",
      },
    });
  }

  switch (req.method) {
    case "DELETE": {
      const r = await removeFileFromProject(auth, { space, fileId });
      if (r.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: r.error.message,
          },
        });
      }
      res.status(200).json({});
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
