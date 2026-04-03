/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  PROJECT_TODO_CATEGORIES,
  type ProjectTodoType,
} from "@app/types/project_todo";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PostProjectTodoBodySchema = z.object({
  category: z.enum(PROJECT_TODO_CATEGORIES),
  text: z.string().min(1, "Text cannot be empty."),
});

export interface GetProjectTodosResponseBody {
  todos: ProjectTodoType[];
}

export interface PostProjectTodoResponseBody {
  todo: ProjectTodoType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectTodosResponseBody | PostProjectTodoResponseBody
    >
  >,
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

  switch (req.method) {
    case "GET": {
      const todos = await ProjectTodoResource.fetchLatestBySpace(auth, {
        spaceId: space.id,
      });

      return res.status(200).json({ todos: todos.map((t) => t.toJSON()) });
    }

    case "POST": {
      const parseResult = PostProjectTodoBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: parseResult.error.message,
          },
        });
      }

      const { category, text } = parseResult.data;
      const user = auth.getNonNullableUser();

      const todo = await ProjectTodoResource.makeNew(auth, {
        spaceId: space.id,
        userId: user.id,
        createdByType: "user",
        createdByUserId: user.id,
        createdByAgentConfigurationId: null,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        category,
        text,
        status: "todo",
        version: 1,
        doneAt: null,
        actorRationale: null,
      });

      return res.status(201).json({ todo: todo.toJSON() });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
