/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { PostStartPodTaskResponseBody } from "@app/lib/api/projects/tasks";
import { PostStartPodTaskBodySchema } from "@app/lib/api/projects/tasks";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { startAgentForProjectTask } from "@app/lib/project_task/start_agent";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { APIErrorType, WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostStartPodTaskResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tasks are only available for project spaces.",
      },
    });
  }

  const { taskId } = req.query;
  if (!isString(taskId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid task id.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const parsedBody = PostStartPodTaskBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: parsedBody.error.message,
          },
        });
      }

      const { customMessage, agentConfigurationId } = parsedBody.data;
      const startRes = await startAgentForProjectTask(auth, {
        space,
        taskId,
        customMessage,
        agentConfigurationId,
      });
      if (startRes.isErr()) {
        return apiError(req, res, {
          status_code: startRes.error.statusCode,
          api_error: {
            type: startRes.error.type as APIErrorType,
            message: startRes.error.message,
          },
        });
      }

      return res.status(200).json({
        task: startRes.value.task,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
