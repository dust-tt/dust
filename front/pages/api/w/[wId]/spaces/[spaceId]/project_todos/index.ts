/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type {
  ProjectTodoAssigneeType,
  ProjectTodoType,
} from "@app/types/project_todo";
import type { ModelId } from "@app/types/shared/model_id";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetProjectTodosResponseBody {
  todos: ProjectTodoType[];
  lastReadAt: string | null;
  viewerUserId: string | null;
  users: ProjectTodoAssigneeType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetProjectTodosResponseBody>>,
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
      const currentUser = auth.getNonNullableUser();
      const state = await ProjectTodoStateResource.fetchBySpace(auth, {
        spaceId: space.id,
      });

      const todos = await ProjectTodoResource.fetchBySpace(auth, {
        spaceId: space.id,
        lastCleanedAt: state?.lastCleanedAt ?? null,
      });
      const assigneeIds = [...new Set(todos.map((todo) => todo.userId))];
      const assignees = await UserResource.fetchByModelIds(assigneeIds);
      const assigneeByModelId = new Map<ModelId, ProjectTodoAssigneeType>(
        assignees.map((user) => [
          user.id,
          {
            sId: user.sId,
            fullName: user.fullName(),
            image: user.imageUrl,
          },
        ])
      );

      const todoIds = todos.map((t) => t.sId);

      // Fetch sources for all todos (across all version rows).
      const [sourcesByTodoId, conversationIdByTodoId] = await Promise.all([
        ProjectTodoResource.fetchSourcesForTodoIds(auth, {
          sIds: todoIds,
        }),
        ProjectTodoResource.fetchConversationIdsForTodoIds(auth, {
          sIds: todoIds,
        }),
      ]);

      // TODO: enrich todos with creator/done-by user info when supporting multiple users.
      const todosWithSources: ProjectTodoType[] = todos.map((t) => {
        const sources = sourcesByTodoId.get(t.sId) ?? [];
        const assignee = assigneeByModelId.get(t.userId);
        return {
          ...t.toJSON({ assigneeId: assignee?.sId ?? "" }),
          user: assignee ?? null,
          conversationId: conversationIdByTodoId.get(t.sId) ?? null,
          sources: sources.map((s) => ({
            sourceType: s.sourceType,
            sourceId: s.sourceId,
            sourceTitle: s.sourceTitle,
            sourceUrl: s.sourceUrl,
          })),
        };
      });

      return res.status(200).json({
        todos: todosWithSources,
        lastReadAt: state ? state.lastReadAt.toISOString() : null,
        viewerUserId: currentUser.sId,
        users: [...assigneeByModelId.values()],
      });
    }

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

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
