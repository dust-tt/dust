/** @ignoreswagger */
// @migration-status: MIGRATED_TO_HONO
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { seedInitialPodTasks } from "@app/lib/project_task/seed_initial_pod_tasks";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { PodTaskType } from "@app/types/project_task";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { NextApiRequest, NextApiResponse } from "next";

export type PostSeedInitialPodTasksResponseBody = {
  tasks: PodTaskType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostSeedInitialPodTasksResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  switch (req.method) {
    case "POST": {
      const result = await seedInitialPodTasks(auth, space);
      if (result.isErr()) {
        switch (result.error.code) {
          case "not_a_project":
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          case "already_seeded":
            return apiError(req, res, {
              status_code: 409,
              api_error: {
                type: "invalid_request_error",
                message: result.error.message,
              },
            });
          case "internal_error":
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: result.error.message,
              },
            });
          default:
            assertNever(result.error.code);
        }
      }

      return res.status(201).json({ tasks: result.value });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanAdministrate: true },
  })
);
