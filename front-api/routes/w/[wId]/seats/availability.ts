import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";

import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetSeatAvailabilityResponseBody = {
  hasAvailableSeats: boolean;
};

// Mounted at /api/w/:wId/seats/availability.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
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
  return ctx.json(body);
});

export default app;
