/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetProjectTodosResponseBody {
  todos: ProjectTodoType[];
  lastReadAt: string | null;
  viewerUserId: string | null;
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

      const todoIds = todos.map((t) => t.sId);

      // Fetch sources for all todos (across all version rows).
      const sourcesByTodoId = await ProjectTodoResource.fetchSourcesForTodoIds(
        auth,
        {
          sIds: todoIds,
        }
      );

      const serializedBase = todos.map((t) => t.toJSON());
      const conversationSIds = [
        ...new Set(
          serializedBase
            .map((s) => s.conversationId)
            .filter((id): id is string => id !== null)
        ),
      ];
      const listItemByConversationSId =
        await ConversationResource.fetchListItemsBySIds(auth, conversationSIds);

      // TODO: enrich todos with creator/done-by user info when supporting multiple users.
      const todosWithSources: ProjectTodoType[] = serializedBase.map(
        (serializedTodo, i) => {
          const t = todos[i]!;
          const sources = sourcesByTodoId.get(t.sId) ?? [];
          const { conversationId } = serializedTodo;
          let conversationSidebarStatus: ProjectTodoType["conversationSidebarStatus"] =
            null;
          if (conversationId) {
            const listItem = listItemByConversationSId.get(conversationId);
            conversationSidebarStatus = listItem
              ? getConversationDotStatus(listItem)
              : "idle";
          }

          return {
            ...serializedTodo,
            conversationSidebarStatus,
            sources: sources.map((s) => ({
              sourceType: s.sourceType,
              sourceId: s.sourceId,
              sourceTitle: s.sourceTitle,
              sourceUrl: s.sourceUrl,
            })),
          };
        }
      );

      return res.status(200).json({
        todos: todosWithSources,
        lastReadAt: state ? state.lastReadAt.toISOString() : null,
        viewerUserId: currentUser.sId,
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
