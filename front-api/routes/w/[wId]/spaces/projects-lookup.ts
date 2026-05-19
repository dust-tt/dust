import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { SpaceResource } from "@app/lib/resources/space_resource";

// Mounted under /api/w/:wId/spaces/projects-lookup.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const ids = c.req.queries("ids");

  if (!ids || ids.length === 0) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The query parameter `ids` is required.",
      },
    });
  }

  const uniqueIds = Array.from(new Set(ids));
  const spaces = await SpaceResource.fetchByIds(auth, uniqueIds);
  const openProjects = spaces.filter(
    (space) => space.isProject() && space.canRead(auth)
  );

  const projectsWithDescriptions = await enrichProjectsWithMetadata(
    auth,
    openProjects
  );

  return c.json({
    spaces: projectsWithDescriptions,
  });
});

export default app;
