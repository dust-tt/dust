import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { GetFreeSeatCountsResponseBody } from "@app/types/api/members";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/members/free-seats.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetFreeSeatCountsResponseBody> => {
    const auth = ctx.get("auth");
    const freeSeatCounts = await MembershipResource.getFreeSeatCounts({
      workspace: auth.getNonNullableWorkspace(),
    });
    return ctx.json({ freeSeatCounts });
  }
);

export default app;
