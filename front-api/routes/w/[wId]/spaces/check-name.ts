import { SpaceResource } from "@app/lib/resources/space_resource";

import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted under /api/w/:wId/spaces/check-name.
const app = new Hono();

app.get("/", async (ctx) => {
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
