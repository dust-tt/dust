import { Hono } from "hono";

import { ProjectTaskStateResource } from "@app/lib/resources/project_task_state_resource";

import { spaceResource } from "@front-api/middleware/space_resource";

// Mounted under /api/w/:wId/spaces/:spaceId/project_tasks/mark_read.
const app = new Hono();

app.post("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");

  if (!space.isProject()) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Todos are only available for project spaces.",
        },
      },
      400
    );
  }

  await ProjectTaskStateResource.upsertBySpace(auth, {
    spaceId: space.id,
    lastReadAt: new Date(),
  });

  return c.json({ success: true });
});

export default app;
