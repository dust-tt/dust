import type { GetWorkspaceSeatsCountResponseBody } from "@app/lib/api/workspace";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/seats/count.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetWorkspaceSeatsCountResponseBody> => {
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

  const owner = auth.getNonNullableWorkspace();

  const seatsCount = await MembershipResource.countActiveSeatsInWorkspace(
    owner.sId
  );
  return ctx.json({ seatsCount });
});

export default app;
