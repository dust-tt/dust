/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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

      const todoSIds = todos.map((t) => t.sId);

      // Fetch sources for all todos (across all version rows).
      const sourcesByTodoSId =
        await ProjectTodoResource.fetchSourcesForTodoSIds(auth, {
          sIds: todoSIds,
        });

      // Resolve conversation titles for conversation-type sources.
      const allConversationSIds = new Set<string>();
      for (const sources of sourcesByTodoSId.values()) {
        for (const source of sources) {
          if (source.sourceType === "conversation") {
            allConversationSIds.add(source.sourceId);
          }
        }
      }

      const titleByConversationSId = new Map<string, string | null>();
      if (allConversationSIds.size > 0) {
        const conversations = await ConversationResource.fetchByIds(auth, [
          ...allConversationSIds,
        ]);
        for (const conversation of conversations) {
          titleByConversationSId.set(conversation.sId, conversation.title);
        }
      }

      // Combine todo data with enriched sources.
      const todosWithSources: ProjectTodoType[] = todos.map((t) => {
        const sources = sourcesByTodoSId.get(t.sId) ?? [];
        return {
          ...t.toJSON(),
          sources: sources.map((s) => ({
            sourceType: s.sourceType,
            sourceId: s.sourceId,
            title:
              s.sourceType === "conversation"
                ? (titleByConversationSId.get(s.sourceId) ?? null)
                : null,
          })),
        };
      });

      return res.status(200).json({ todos: todosWithSources });
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
