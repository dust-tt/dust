import { enrichProjectsWithMetadata } from "@app/lib/api/projects/list";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpacesLookupResponseBody } from "@app/types/api/projects/list";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted under /api/w/:wId/spaces/projects-lookup.
const app = workspaceApp();

/** @ignoreswagger */
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
