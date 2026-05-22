import { SpaceResource } from "@app/lib/resources/space_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type CheckNameResponseBody = {
  available: boolean;
};

// Mounted under /api/w/:wId/spaces/check-name.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<CheckNameResponseBody> => {
  const auth = ctx.get("auth");
  const name = ctx.req.query("name");

  if (!name || name.length === 0) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The query parameter `name` is required.",
      },
    });
  }

  // Find the space with this name (case-insensitive)
  const existingSpace = await SpaceResource.fetchByName(auth, name);
  return ctx.json({ available: !existingSpace });
});

export default app;
