import type { GetWorkspaceSeatsCountResponseBody } from "@app/lib/api/workspace";
import { countActiveSeatsForWorkspace } from "@app/lib/api/workspace_seats";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/seats/count.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasWorkspacePermission(
    "admin",
    "billing",
    "You need billing access to manage billing settings, invoices, and payment methods."
  ),
  async (ctx): HandlerResult<GetWorkspaceSeatsCountResponseBody> => {
    const auth = ctx.get("auth");

    const owner = auth.getNonNullableWorkspace();

    const seatsCount = await countActiveSeatsForWorkspace(owner.sId);
    return ctx.json({ seatsCount });
  }
);

export default app;
