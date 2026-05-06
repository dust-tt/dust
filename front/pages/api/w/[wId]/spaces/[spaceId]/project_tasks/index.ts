/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import type { ModelId } from "@app/types/shared/model_id";

function parseSingleQueryValue(
  value: NextApiRequest["query"][string] | undefined
): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

const PROJECT_TODO_TIME_SCOPE_VALUES = [
  "active",
  "last_24h",
  "last_7d",
  "last_30d",
] as const;

type ProjectTaskFetchTimeScope =
  (typeof PROJECT_TODO_TIME_SCOPE_VALUES)[number];

function parseProjectTaskTimeScope(
  req: NextApiRequest
): ProjectTaskFetchTimeScope {
  const raw =
    parseSingleQueryValue(req.query.period)?.toLowerCase() ?? "active";
  if ((PROJECT_TODO_TIME_SCOPE_VALUES as readonly string[]).includes(raw)) {
    return raw as ProjectTaskFetchTimeScope;
  }
  return "active";
}

function parsePeopleMineOnly(req: NextApiRequest): boolean {
  const legacy = parseSingleQueryValue(req.query.assignee)?.toLowerCase();
  const explicit = parseSingleQueryValue(req.query.people)?.toLowerCase();

  const token = explicit ?? legacy ?? "all";
  return token === "mine";
}

import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTaskType } from "@app/types/project_task";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export interface GetProjectTasksResponseBody {
  tasks: ProjectTaskType[];
  lastReadAt: string | null;
  viewerUserId: string | null;
}

const PostProjectTaskBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required.")
    .max(256, "Text must be at most 256 characters."),
  assigneeUserId: z.string().min(1, "Assignee is required."),
});

export interface PostProjectTaskResponseBody {
  task: ProjectTaskType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      GetProjectTasksResponseBody | PostProjectTaskResponseBody
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
        message: "Tasks are only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const currentUser = auth.getNonNullableUser();
      const state = await ProjectTaskStateResource.fetchBySpace(auth, {
        spaceId: space.id,
      });
      const timeScope = parseProjectTaskTimeScope(req);
      const viewerOnlyMine = parsePeopleMineOnly(req);
      let assigneeUserId: ModelId | null = null;
      if (viewerOnlyMine) {
        assigneeUserId = currentUser.id;
      }

      const todos = await ProjectTaskResource.fetchBySpace(auth, {
        spaceId: space.id,
        timeScope,
        assigneeUserId,
      });

      const todoIds = todos.map((t) => t.sId);

      // Fetch sources for all todos (across all version rows).
      const sourcesByTodoId = await ProjectTaskResource.fetchSourcesForTaskIds(
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
      const todosWithSources: ProjectTaskType[] = serializedBase.map(
        (serializedTodo, i) => {
          const t = todos[i]!;
          const sources = sourcesByTodoId.get(t.sId) ?? [];
          const { conversationId } = serializedTodo;
          let conversationSidebarStatus: ProjectTaskType["conversationSidebarStatus"] =
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
        tasks: todosWithSources,
        lastReadAt: state ? state.lastReadAt.toISOString() : null,
        viewerUserId: currentUser.sId,
      });
    }

    case "POST": {
      const parseResult = PostProjectTaskBodySchema.safeParse(req.body);
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

      const newTodo = await ProjectTaskResource.makeNew(auth, {
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
        agentInstructions: null,
      });

      const todoResource = await ProjectTaskResource.fetchBySId(
        auth,
        newTodo.sId
      );
      if (!todoResource) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to load the new task.",
          },
        });
      }

      // Manual creates are never linked to a conversation until someone uses "Start"
      // (see project_task/start); skip getLatestConversationId and keep the same shape as GET.
      return res.status(201).json({
        task: {
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
