/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { removeContentNodeFromProject } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const DeleteProjectContextContentNodeBodySchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  nodeDataSourceViewId: z.string().min(1, "nodeDataSourceViewId is required"),
});

export type DeleteProjectContextContentNodeResponseBody = Record<string, never>;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<DeleteProjectContextContentNodeResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const { spaceId } = req.query;
  if (!isString(spaceId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid spaceId query parameter.",
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
      const bodyValidation =
        DeleteProjectContextContentNodeBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        const errorMessage = bodyValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${errorMessage}`,
          },
        });
      }

      const r = await removeContentNodeFromProject(auth, {
        space,
        nodeId: bodyValidation.data.nodeId,
        nodeDataSourceViewId: bodyValidation.data.nodeDataSourceViewId,
      });
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
