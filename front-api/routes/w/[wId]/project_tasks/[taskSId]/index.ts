import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type ConversationDotStatus,
  getConversationDotStatus,
} from "@app/lib/utils/conversation_dot_status";
import type { PodTaskType } from "@app/types/project_task";
import type { PodType } from "@app/types/space";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  taskSId: z.string(),
});

export interface GetWorkspaceProjectTaskResponseBody {
  task: PodTaskType;
  /** Pod space (same shape as entries in `GET /api/w/{wId}/spaces` for pods). */
  space: PodType;
}

// Mounted at /api/w/:wId/project_tasks/:taskSId.
const app = workspaceApp();

app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { taskSId } = ctx.req.valid("param");
  if (!taskSId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid task id.",
      },
    });
  }

  const taskRow = await ProjectTaskResource.fetchBySId(auth, taskSId);
  if (!taskRow) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "project_task_not_found",
        message: "Task not found.",
      },
    });
  }

  const [space] = await SpaceResource.fetchByModelIds(auth, [taskRow.spaceId]);
  if (!space || !space.canRead(auth) || !space.isProject()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "project_task_not_found",
        message: "Task not found.",
      },
    });
  }

  const sourcesByTaskId = await ProjectTaskResource.fetchSourcesForTaskIds(
    auth,
    { sIds: [taskRow.sId] }
  );
  const conversationId = await taskRow.getLatestConversationId(auth);

  const serializedBase = taskRow.toJSON();
  let conversationSidebarStatus: ConversationDotStatus | null = null;
  let conversationIsRunningAgentLoop: boolean = false;
  if (conversationId) {
    const listItemByConversationSId =
      await ConversationResource.fetchListItemsBySIds(auth, [conversationId]);
    const listItem = listItemByConversationSId.get(conversationId);
    conversationSidebarStatus = listItem
      ? getConversationDotStatus(listItem)
      : "idle";
    conversationIsRunningAgentLoop = listItem?.isRunningAgentLoop ?? false;
  }

  const sources = sourcesByTaskId.get(taskRow.sId) ?? [];
  const taskPayload: PodTaskType = {
    ...serializedBase,
    conversationId,
    conversationSidebarStatus,
    conversationIsRunningAgentLoop,
    sources: sources.map((s) => ({
      sourceType: s.sourceType,
      sourceId: s.sourceId,
      sourceTitle: s.sourceTitle,
      sourceUrl: s.sourceUrl,
    })),
  };

  const [projectSpace] = await enrichProjectsWithMetadata(auth, [space]);
  if (!projectSpace) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "project_task_not_found",
        message: "Task not found.",
      },
    });
  }

  return ctx.json<GetWorkspaceProjectTaskResponseBody>({
    task: taskPayload,
    space: projectSpace,
  });
});

export default app;
