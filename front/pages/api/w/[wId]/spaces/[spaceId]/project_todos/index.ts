/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { ProjectTodoStateResource } from "@app/lib/resources/project_todo_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export interface GetProjectTodosResponseBody {
  todos: ProjectTodoType[];
  lastReadAt: string | null;
  viewerUserId: string | null;
}

const PostProjectTodoBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required.")
    .max(256, "Text must be at most 256 characters."),
  assigneeUserId: z.string().min(1, "Assignee is required."),
});

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

    case "POST": {
      const parseResult = PostProjectTodoBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: parseResult.error.issues[0]?.message ?? "Invalid body.",
          },
        });
      }

      const { text, assigneeUserId } = parseResult.data;
      const workspace = auth.getNonNullableWorkspace();
      const currentUser = auth.getNonNullableUser();

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

      const newTodo = await ProjectTodoResource.makeNew(auth, {
        spaceId: space.id,
        userId: assigneeUser.id,
        createdByType: "user",
        createdByUserId: currentUser.id,
        createdByAgentConfigurationId: null,
        markedAsDoneByType: null,
        markedAsDoneByUserId: null,
        markedAsDoneByAgentConfigurationId: null,
        text,
        status: "todo",
        doneAt: null,
        actorRationale: null,
      });

      const todoResource = await ProjectTodoResource.fetchBySId(
        auth,
        newTodo.sId
      );
      if (!todoResource) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to load the new to-do.",
          },
        });
      }

      // Manual creates are never linked to a conversation until someone uses "Start"
      // (see project_todo/start); skip getLatestConversationId and keep the same shape as GET.
      return res.status(201).json({
        todo: {
          ...todoResource.toJSON(),
          conversationId: null,
          conversationSidebarStatus: null,
        },
      });
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
