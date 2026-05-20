/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { moveProjectContextFile } from "@app/lib/api/projects/context";
import { MovePodContextFileRequestBodySchema } from "@app/lib/api/projects/pod_mount_schemas";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

export type MoveProjectContextFileResponseBody = Record<string, never>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<MoveProjectContextFileResponseBody>
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
        message: "Only project spaces support project context file moves.",
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

  switch (req.method) {
    case "POST": {
      const bodyValidation = MovePodContextFileRequestBodySchema.safeParse(
        req.body
      );
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const moveResult = await moveProjectContextFile(auth, {
        space,
        file,
        parentRelativePath: bodyValidation.data.parentRelativePath,
      });
      if (moveResult.isErr()) {
        const error = moveResult.error;
        const statusCode =
          "code" in error && error.code === "invalid_request_error" ? 400 : 500;
        return apiError(req, res, {
          status_code: statusCode,
          api_error: {
            type:
              statusCode === 400
                ? "invalid_request_error"
                : "internal_server_error",
            message: error.message,
          },
        });
      }

      return res.status(200).json({});
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Only POST is supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
