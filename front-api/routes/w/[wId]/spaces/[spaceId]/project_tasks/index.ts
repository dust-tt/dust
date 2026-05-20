import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import {
  type ConversationDotStatus,
  getConversationDotStatus,
} from "@app/lib/utils/conversation_dot_status";
import {
  isProjectTaskPeriodScope,
  type ProjectTaskPeriodScope,
  type ProjectTaskType,
} from "@app/types/project_task";
import type { ModelId } from "@app/types/shared/model_id";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";
import taskId from "./[taskId]";
import bulkActions from "./bulk-actions";
import markRead from "./mark_read";

const PostProjectTaskBodySchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Text is required.")
    .max(256, "Text must be at most 256 characters."),
  /** Omit to assign to the current user; pass `null` for unassigned (or the sole assignable member if the project has exactly one). */
  assigneeUserId: z.union([z.string().min(1), z.null()]).optional(),
});

function parseSingleQueryValue(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseProjectTaskTimeScope(
  period: string | undefined
): ProjectTaskPeriodScope {
  const raw = parseSingleQueryValue(period)?.toLowerCase() ?? "active";
  if (isProjectTaskPeriodScope(raw)) {
    return raw;
  }
  return "active";
}

type ProjectTasksPeopleFetchMode = "all" | "mine";

function parseProjectTasksPeopleMode(
  people: string | undefined,
  assignee: string | undefined
): ProjectTasksPeopleFetchMode {
  const legacy = parseSingleQueryValue(assignee)?.toLowerCase();
  const explicit = parseSingleQueryValue(people)?.toLowerCase();

  const token = explicit ?? legacy ?? "all";
  if (token === "mine") {
    return "mine";
  }
  return "all";
}

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks.
const app = new Hono();

app.get("/", spaceResource({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  if (!space.isProject()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Tasks are only available for project spaces.",
      },
    });
  }

  const currentUser = auth.getNonNullableUser();
  const state = await ProjectTaskStateResource.fetchBySpace(auth, {
    spaceId: space.id,
  });
  const timeScope = parseProjectTaskTimeScope(ctx.req.query("period"));
  const peopleMode = parseProjectTasksPeopleMode(
    ctx.req.query("people"),
    ctx.req.query("assignee")
  );
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
  const todosWithSources: ProjectTaskType[] = serializedBase.map(
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
        conversationIsRunningAgentLoop = listItem?.isRunningAgentLoop ?? false;
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

  return ctx.json({
    tasks: todosWithSources,
    lastReadAt: state ? state.lastReadAt.toISOString() : null,
    viewerUserId: currentUser.sId,
  });
});

app.post(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", PostProjectTaskBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Tasks are only available for project spaces.",
        },
      });
    }

    const { text, assigneeUserId } = ctx.req.valid("json");
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
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Assignee user not found.",
          },
        });
      }

      if (!space.isMember(assigneeAuth)) {
        return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to load the new task.",
        },
      });
    }

    // Manual creates are never linked to a conversation until someone uses "Start"
    // (see project_task/start); skip getLatestConversationId and keep the same shape as GET.
    return ctx.json(
      {
        task: {
          ...todoResource.toJSON(),
          conversationId: null,
          conversationSidebarStatus: null,
        },
      },
      201
    );
  }
);

// Register static paths BEFORE `/:taskId` so the param route does not
// swallow these names as ids.
app.route("/mark_read", markRead);
app.route("/bulk-actions", bulkActions);
app.route("/:taskId", taskId);

export default app;
