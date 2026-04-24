/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ProjectTodoResource } from "@app/lib/resources/project_todo_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { PROJECT_TODO_STATUSES } from "@app/types/project_todo";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type BulkActionsResponse = {
  success: boolean;
  cleanedCount?: number;
};

export const BulkActionsBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("set_status"),
    todoIds: z.array(z.string().min(1)).min(1).max(200),
    status: z.enum(PROJECT_TODO_STATUSES),
  }),
  z.object({
    action: z.literal("clean_done"),
  }),
]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<BulkActionsResponse>>,
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

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const parseResult = BulkActionsBodySchema.safeParse(req.body);
  if (!parseResult.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(parseResult.error).toString(),
      },
    });
  }

  const body = parseResult.data;

  switch (body.action) {
    case "set_status": {
      const user = auth.getNonNullableUser();
      const updates: Parameters<ProjectTodoResource["updateWithVersion"]>[1] =
        body.status === "done"
          ? {
              status: body.status,
              doneAt: new Date(),
              markedAsDoneByType: "user",
              markedAsDoneByUserId: user.id,
              markedAsDoneByAgentConfigurationId: null,
            }
          : {
              status: body.status,
              doneAt: null,
              markedAsDoneByType: null,
              markedAsDoneByUserId: null,
              markedAsDoneByAgentConfigurationId: null,
            };

      const result = await ProjectTodoResource.bulkUpdateWithVersionBySIds(
        auth,
        { sIds: body.todoIds, spaceId: space.id, updates }
      );

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    case "clean_done": {
      const result = await ProjectTodoResource.cleanDoneBySpace(auth, {
        spaceId: space.id,
      });

      if (result.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: result.error.message,
          },
        });
      }

      return res
        .status(200)
        .json({ success: true, cleanedCount: result.value.cleanedCount });
    }

    default:
      assertNever(body);
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanRead: true },
  })
);
