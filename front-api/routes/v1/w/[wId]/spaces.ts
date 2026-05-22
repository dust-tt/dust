import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType } from "@app/types/space";
import { publicApiApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type GetPublicSpacesResponseBody = {
  spaces: SpaceType[];
};

// Mounted at /api/v1/w/:wId/spaces. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.get("/", async (ctx): HandlerResult<GetPublicSpacesResponseBody> => {
  const auth = ctx.get("auth");

  const allSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);
  const spaces = allSpaces.filter((space) => space.kind !== "conversations");

  return ctx.json({
    spaces: spaces.map((space) => space.toJSON()),
  });
});

export default app;
