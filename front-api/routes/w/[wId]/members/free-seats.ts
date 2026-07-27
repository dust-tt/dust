import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { GetFreeSeatCountsResponseBody } from "@app/types/api/members";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/members/free-seats.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetFreeSeatCountsResponseBody> => {
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

  const freeSeatCounts = await MembershipResource.getFreeSeatCounts({
    workspace: auth.getNonNullableWorkspace(),
  });
  return ctx.json({ freeSeatCounts });
});

export default app;
