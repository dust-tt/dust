import { MembershipResource } from "@app/lib/resources/membership_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type GetWorkspaceSeatsCountResponseBody = {
  seatsCount: number;
};

// Mounted at /api/w/:wId/seats/count.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetWorkspaceSeatsCountResponseBody> => {
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

  const owner = auth.getNonNullableWorkspace();

  const seatsCount = await MembershipResource.countActiveSeatsInWorkspace(
    owner.sId
  );
  return ctx.json({ seatsCount });
});

export default app;
