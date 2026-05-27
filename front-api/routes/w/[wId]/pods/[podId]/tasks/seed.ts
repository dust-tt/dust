import { seedInitialPodTasks } from "@app/lib/project_task/seed_initial_pod_tasks";
import type { PodTaskType } from "@app/types/project_task";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

export type PostSeedInitialPodTasksResponseBody = {
  tasks: PodTaskType[];
};

// Mounted under /api/w/:wId/pods/:podId/tasks/seed.
const app = workspaceApp();

app.post(
  "/",
  withSpace({ requireCanAdministrate: true, routeParam: "podId" }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const result = await seedInitialPodTasks(auth, space);
    if (result.isErr()) {
      switch (result.error.code) {
        case "not_a_project":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        case "already_seeded":
          return apiError(ctx, {
            status_code: 409,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
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

    return ctx.json({ tasks: result.value }, 201);
  }
);

export default app;
