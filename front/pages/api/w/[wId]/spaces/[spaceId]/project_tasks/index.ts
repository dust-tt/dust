/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type ConversationDotStatus,
  getConversationDotStatus,
} from "@app/lib/utils/conversation_dot_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  isPodTaskPeriodScope,
  type PodTaskPeriodScope,
  type PodTaskType,
} from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

function parseSingleQueryValue(
  value: NextApiRequest["query"][string] | undefined
): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return isString(v) && v.trim().length > 0 ? v.trim() : undefined;
}

function parseProjectTaskTimeScope(req: NextApiRequest): PodTaskPeriodScope {
  const raw =
    parseSingleQueryValue(req.query.period)?.toLowerCase() ?? "active";
  if (isPodTaskPeriodScope(raw)) {
    return raw;
  }
  return "active";
}

type ProjectTasksPeopleFetchMode = "all" | "mine";

function parseProjectTasksPeopleMode(
  req: NextApiRequest
): ProjectTasksPeopleFetchMode {
  const legacy = parseSingleQueryValue(req.query.assignee)?.toLowerCase();
  const explicit = parseSingleQueryValue(req.query.people)?.toLowerCase();

  const token = explicit ?? legacy ?? "all";
  if (token === "mine") {
    return "mine";
  }
  return "all";
}

export interface GetPodTasksResponseBody {
  tasks: PodTaskType[];
  lastReadAt: string | null;
  viewerUserId: string | null;
}

const PostPodTaskBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required.")
    .max(256, "Text must be at most 256 characters."),
  /** Omit to assign to the current user; pass `null` for unassigned (or the sole assignable member if the pod has exactly one). */
  assigneeUserId: z.union([z.string().min(1), z.null()]).optional(),
});

export interface PostPodTaskResponseBody {
  task: PodTaskType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetPodTasksResponseBody | PostPodTaskResponseBody>
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
      const peopleMode = parseProjectTasksPeopleMode(req);
      const assigneeUserId: ModelId | null =
        peopleMode === "mine" ? currentUser.id : null;

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
      const todosWithSources: PodTaskType[] = serializedBase.map(
        (serializedTodo, i) => {
          const t = todos[i]!;
          const sources = sourcesByTodoId.get(t.sId) ?? [];
          const { conversationId } = serializedTodo;
          let conversationSidebarStatus: ConversationDotStatus | null = null;
          let conversationIsRunningAgentLoop: boolean = false;
          if (conversationId) {
            const listItem = listItemByConversationSId.get(conversationId);
            conversationSidebarStatus = listItem
              ? getConversationDotStatus(listItem)
              : "idle";
            conversationIsRunningAgentLoop =
              listItem?.isRunningAgentLoop ?? false;
          }

          return {
            ...serializedTodo,
            conversationSidebarStatus,
            conversationIsRunningAgentLoop,
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
      const parseResult = PostPodTaskBodySchema.safeParse(req.body);
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

      let taskUserModelId: ModelId | null;
      if (assigneeUserId === undefined) {
        taskUserModelId = currentUser.id;
      } else if (assigneeUserId === null) {
        const assignable =
          await space.fetchDistinctActiveManualGroupMembers(auth);
        const soleModelId = assignable.length === 1 ? assignable[0]!.id : null;
        taskUserModelId = soleModelId;
      } else {
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

        taskUserModelId = assigneeUser.id;
      }

      const newTodo = await ProjectTaskResource.makeNew(auth, {
        spaceId: space.id,
        userId: taskUserModelId,
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
