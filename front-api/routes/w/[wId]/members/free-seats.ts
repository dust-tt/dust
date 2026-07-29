import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { GetFreeSeatCountsResponseBody } from "@app/types/api/members";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/members/free-seats.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasWorkspacePermission(
    "admin",
    "billing",
    "You need billing access to manage billing settings, invoices, and payment methods."
  ),
  async (ctx): HandlerResult<GetFreeSeatCountsResponseBody> => {
    const auth = ctx.get("auth");

    const freeSeatCounts = await MembershipResource.getFreeSeatCounts({
      workspace: auth.getNonNullableWorkspace(),
    });
    return ctx.json({ freeSeatCounts });
  }
);

export default app;
