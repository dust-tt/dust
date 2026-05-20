import { ProjectTaskResource } from "@app/lib/resources/project_task_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectTaskType } from "@app/types/project_task";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeListProjectTasks = {
  tasks: ProjectTaskType[];
};

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/tasks.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const projectId = ctx.req.param("projectId");
  if (!projectId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid project ID.",
      },
    });
  }

  const space = await SpaceResource.fetchById(auth, projectId);
  if (!space || !space.isProject()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Project not found.",
      },
    });
  }

  const tasks = await ProjectTaskResource.fetchBySpace(auth, {
    spaceId: space.id,
    timeScope: "all",
  });

  const body: PokeListProjectTasks = { tasks: tasks.map((t) => t.toJSON()) };
  return ctx.json(body);
});

export default app;
