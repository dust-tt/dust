import { Hono } from "hono";

import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";

export type GetSeatAvailabilityResponseBody = {
  hasAvailableSeats: boolean;
};

// Mounted at /api/w/:wId/seats/availability.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  if (!auth.isAdmin()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message:
            "Only users that are `admins` for the current workspace can access this endpoint.",
        },
      },
      403
    );
  }

  const hasAvailableSeats = await checkWorkspaceSeatAvailabilityUsingAuth(auth);
  const body: GetSeatAvailabilityResponseBody = { hasAvailableSeats };
  return c.json(body);
});

export default app;
