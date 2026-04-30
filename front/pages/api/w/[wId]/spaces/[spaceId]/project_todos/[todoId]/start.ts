/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { startAgentForProjectTodo } from "@app/lib/project_todo/start_agent";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { APIErrorType, WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export interface PostStartProjectTodoResponseBody {
  todo: ProjectTodoType;
}

const PostStartProjectTodoBodySchema = z.object({
  customMessage: z.string().optional(),
  agentConfigurationId: z.string().optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostStartProjectTodoResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Todos are only available for project spaces.",
      },
    });
  }

  const { todoId } = req.query;
  if (!isString(todoId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid todo id.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const parsedBody = PostStartProjectTodoBodySchema.safeParse(
        req.body ?? {}
      );
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
      const startRes = await startAgentForProjectTodo(auth, {
        space,
        todoId,
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
        todo: startRes.value.todo,
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
