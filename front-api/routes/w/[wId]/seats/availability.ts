import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetSeatAvailabilityResponseBody = {
  hasAvailableSeats: boolean;
};

// Mounted at /api/w/:wId/seats/availability.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetSeatAvailabilityResponseBody> => {
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
  return ctx.json({ hasAvailableSeats });
});

export default app;
