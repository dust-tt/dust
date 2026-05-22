import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { withSpace } from "@front-api/middleware/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/mark_read.
const app = workspaceApp();

app.post("/", withSpace({ requireCanRead: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  if (!space.isProject()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Todos are only available for project spaces.",
      },
    });
  }

  await ProjectTaskStateResource.upsertBySpace(auth, {
    spaceId: space.id,
    lastReadAt: new Date(),
  });

  return ctx.json({ success: true });
});

export default app;
