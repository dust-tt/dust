/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  PROJECT_TODO_STATUSES,
  type ProjectTodoType,
} from "@app/types/project_todo";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

const PatchProjectTodoBodySchema = z
  .object({
    text: z.string().min(1, "Text cannot be empty.").optional(),
    status: z.enum(PROJECT_TODO_STATUSES).optional(),
  })
  .refine((data) => data.text !== undefined || data.status !== undefined, {
    message: "At least one of text or status must be provided.",
  });

export interface PatchProjectTodoResponseBody {
  todo: ProjectTodoType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PatchProjectTodoResponseBody>>,
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

  const todo = await ProjectTodoResource.fetchBySId(auth, todoId);
  if (!todo || todo.spaceId !== space.id) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "project_todo_not_found",
        message: "Todo not found.",
      },
    });
  }

  switch (req.method) {
    case "PATCH": {
      const parseResult = PatchProjectTodoBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: parseResult.error.message,
          },
        });
      }

      const { text, status } = parseResult.data;
      const user = auth.getNonNullableUser();

      const updates: Parameters<typeof todo.createVersion>[1] = {};

      if (text !== undefined) {
        updates.text = text;
      }

      if (status !== undefined) {
        updates.status = status;
        if (status === "done") {
          updates.markedAsDoneByType = "user";
          updates.markedAsDoneByUserId = user.id;
          updates.markedAsDoneByAgentConfigurationId = null;
          updates.doneAt = new Date();
        } else {
          // Clearing done status — reset all done-by fields.
          updates.markedAsDoneByType = null;
          updates.markedAsDoneByUserId = null;
          updates.markedAsDoneByAgentConfigurationId = null;
          updates.doneAt = null;
        }
      }

      const updatedTodo = await todo.createVersion(auth, updates);

      return res.status(200).json({ todo: updatedTodo.toJSON() });
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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
