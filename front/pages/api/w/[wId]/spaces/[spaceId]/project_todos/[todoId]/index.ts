/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { Authenticator } from "@app/lib/auth";
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
    text: z
      .string()
      .min(1, "Text cannot be empty.")
      .max(256, "Text must be at most 256 characters.")
      .optional(),
    status: z.enum(PROJECT_TODO_STATUSES).optional(),
    assigneeUserId: z.string().min(1).optional(),
  })
  .refine(
    (data) =>
      data.text !== undefined ||
      data.status !== undefined ||
      data.assigneeUserId !== undefined,
    {
      message:
        "At least one of text, status, or assigneeUserId must be provided.",
    }
  );

export interface PatchProjectTodoResponseBody {
  todo: ProjectTodoType;
}

export type DeleteProjectTodoResponseBody = never;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      PatchProjectTodoResponseBody | DeleteProjectTodoResponseBody
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

  const user = auth.getNonNullableUser();

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

      const { text, status, assigneeUserId } = parseResult.data;
      const workspace = auth.getNonNullableWorkspace();

      const updates: Parameters<typeof todo.updateWithVersion>[1] = {};

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

      if (assigneeUserId !== undefined) {
        const assigneeAuth = await Authenticator.fromUserIdAndWorkspaceId(
          assigneeUserId,
          workspace.sId
        );
        const assigneeUser = assigneeAuth.user();
        if (!assigneeUser) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Assignee user not found.",
            },
          });
        }
        if (!space.isMember(assigneeAuth)) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Assignee must be a member of this project.",
            },
          });
        }
        updates.userId = assigneeUser.id;
      }

      const updatedTodo = await todo.updateWithVersion(auth, updates);
      const todoResource =
        (await ProjectTodoResource.fetchBySId(auth, updatedTodo.sId)) ??
        updatedTodo;
      const conversationId = await todoResource.getLatestConversationId(auth);

      return res.status(200).json({
        todo: {
          ...todoResource.toJSON(),
          conversationId,
        },
      });
    }

    case "DELETE": {
      await todo.softDelete(auth);

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
