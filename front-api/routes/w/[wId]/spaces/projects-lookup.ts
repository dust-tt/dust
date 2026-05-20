import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ProjectType } from "@app/types/space";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type SpacesLookupResponseBody = {
  spaces: ProjectType[];
};

// Mounted under /api/w/:wId/spaces/projects-lookup.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<SpacesLookupResponseBody> => {
  const auth = ctx.get("auth");
  const ids = ctx.req.queries("ids");

  if (!ids || ids.length === 0) {
    return apiError(ctx, {
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

  return ctx.json({
    spaces: projectsWithDescriptions,
  });
});

export default app;
