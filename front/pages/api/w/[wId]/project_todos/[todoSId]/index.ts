/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import type { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationDotStatus } from "@app/lib/utils/conversation_dot_status";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { ProjectTodoType } from "@app/types/project_todo";
import { isString } from "@app/types/shared/utils/general";
import type { ProjectType } from "@app/types/space";
import type { NextApiRequest, NextApiResponse } from "next";

export interface GetWorkspaceProjectTodoResponseBody {
  todo: ProjectTodoType;
  /** Project space (same shape as entries in `GET /api/w/{wId}/spaces` for projects). */
  space: ProjectType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetWorkspaceProjectTodoResponseBody>
  >,
  auth: Authenticator,
  _session: SessionWithUser | null
): Promise<void> {
  const { todoSId } = req.query;
  if (!isString(todoSId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid todo id.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const todo = await ProjectTodoResource.fetchBySId(auth, todoSId);
      if (!todo) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "project_todo_not_found",
            message: "Todo not found.",
          },
        });
      }

      const [space] = await SpaceResource.fetchByModelIds(auth, [todo.spaceId]);
      if (!space || !space.canRead(auth) || !space.isProject()) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "project_todo_not_found",
            message: "Todo not found.",
          },
        });
      }

      const sourcesByTodoId = await ProjectTodoResource.fetchSourcesForTodoIds(
        auth,
        { sIds: [todo.sId] }
      );
      const conversationId = await todo.getLatestConversationId(auth);

      const serializedBase = todo.toJSON();
      let conversationSidebarStatus: ProjectTodoType["conversationSidebarStatus"] =
        null;
      if (conversationId) {
        const listItemByConversationSId =
          await ConversationResource.fetchListItemsBySIds(auth, [
            conversationId,
          ]);
        const listItem = listItemByConversationSId.get(conversationId);
        conversationSidebarStatus = listItem
          ? getConversationDotStatus(listItem)
          : "idle";
      }

      const sources = sourcesByTodoId.get(todo.sId) ?? [];
      const todoPayload: ProjectTodoType = {
        ...serializedBase,
        conversationId,
        conversationSidebarStatus,
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
            type: "project_todo_not_found",
            message: "Todo not found.",
          },
        });
      }

      return res.status(200).json({
        todo: todoPayload,
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
