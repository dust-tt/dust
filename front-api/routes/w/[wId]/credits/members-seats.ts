import {
  type GetMembersSeatsResponseBody,
  getMembersSeats,
} from "@app/lib/api/credits/members_seats";
import type { WorkspaceType } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/members-seats.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetMembersSeatsResponseBody> => {
  const auth = ctx.get("auth");

  if (!auth.isAdmin()) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only workspace admins can access the members seats summary.",
      },
    });
  }

  const body = await getMembersSeats({ auth });
  return ctx.json(body);
});

export default app;
