import { MembershipResource } from "@app/lib/resources/membership_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetWorkspaceSeatsCountResponseBody = {
  seatsCount: number;
};

// Mounted at /api/w/:wId/seats/count.
const app = workspaceApp();

app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceSeatsCountResponseBody> => {
    const auth = ctx.get("auth");

    const owner = auth.getNonNullableWorkspace();

    const seatsCount = await MembershipResource.countActiveSeatsInWorkspace(
      owner.sId
    );
    return ctx.json({ seatsCount });
  }
);

export default app;
