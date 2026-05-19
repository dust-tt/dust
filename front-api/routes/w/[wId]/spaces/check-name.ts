import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";

import { SpaceResource } from "@app/lib/resources/space_resource";

// Mounted under /api/w/:wId/spaces/check-name.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const name = c.req.query("name");

  if (!name || name.length === 0) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The query parameter `name` is required.",
      },
    });
  }

  // Find the space with this name (case-insensitive)
  const existingSpace = await SpaceResource.fetchByName(auth, name);
  return c.json({ available: !existingSpace });
});

export default app;
