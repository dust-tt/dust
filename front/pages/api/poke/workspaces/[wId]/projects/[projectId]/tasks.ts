/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import type { PokeListProjectTasks } from "@app/lib/api/poke/projects";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListProjectTasks>>,
  session: SessionWithUser
): Promise<void> {
  const { wId, projectId } = req.query;
  if (!isString(wId) || !isString(projectId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid workspace or project ID.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const owner = auth.workspace();

  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const space = await SpaceResource.fetchById(auth, projectId);
      if (!space || !space.isProject()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Project not found.",
          },
        });
      }

      const tasks = await ProjectTaskResource.fetchBySpace(auth, {
        spaceId: space.id,
        timeScope: "all",
      });

      return res.status(200).json({
        tasks: tasks.map((t) => t.toJSON()),
      });

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

export default withSessionAuthenticationForPoke(handler);
