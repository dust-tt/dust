import { getMembersSeats } from "@app/lib/api/credits/members_seats";
import type { GetMembersSeatsResponseBody } from "@app/types/api/credits/members_seats";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/members-seats.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetMembersSeatsResponseBody> => {
  const auth = ctx.get("auth");

  if (!(await auth.hasWorkspacePermission("admin", "billing"))) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "You need billing access to manage billing settings, invoices, and payment methods.",
      },
    });
  }

  const body = await getMembersSeats({ auth });
  return ctx.json(body);
});

export default app;
