import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { workspaceAuth } from "@front-api/middleware/workspace_auth";

import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";

export type GetSeatAvailabilityResponseBody = {
  hasAvailableSeats: boolean;
};

// Mounted at /api/w/:wId/seats/availability.
const app = new Hono();

app.use("*", workspaceAuth());

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can access this endpoint.",
      },
    });
  }

  const hasAvailableSeats = await checkWorkspaceSeatAvailabilityUsingAuth(auth);
  const body: GetSeatAvailabilityResponseBody = { hasAvailableSeats };
  return c.json(body);
});

export default app;
