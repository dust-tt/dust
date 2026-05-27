// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  type ConversationDotStatus,
  getConversationDotStatus,
} from "@app/lib/utils/conversation_dot_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PodTaskType } from "@app/types/project_task";
import { isString } from "@app/types/shared/utils/general";
import type { PodType } from "@app/types/space";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetWorkspacePodTaskResponseBody {
  task: PodTaskType;
  /** Pod space (same shape as entries in `GET /api/w/{wId}/spaces` for pods). */
  space: PodType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspacePodTaskResponseBody>>,
  auth: Authenticator,
  _session: SessionWithUser | null
): Promise<void> {
  const { taskSId } = req.query;
  if (!isString(taskSId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid task id.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const taskRow = await ProjectTaskResource.fetchBySId(auth, taskSId);
      if (!taskRow) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "project_task_not_found",
            message: "Task not found.",
          },
        });
      }

      const [space] = await SpaceResource.fetchByModelIds(auth, [
        taskRow.spaceId,
      ]);
      if (!space || !space.canRead(auth) || !space.isProject()) {
        return apiError(req, res, {
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
          await ConversationResource.fetchListItemsBySIds(auth, [
            conversationId,
          ]);
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
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "project_task_not_found",
            message: "Task not found.",
          },
        });
      }

      return res.status(200).json({
        task: taskPayload,
        space: projectSpace,
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

export default withSessionAuthenticationForWorkspace(handler);
