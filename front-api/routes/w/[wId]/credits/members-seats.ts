import { getMembersSeats } from "@app/lib/api/credits/members_seats";
import type { GetMembersSeatsResponseBody } from "@app/types/api/credits/members_seats";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/members-seats.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureHasWorkspacePermission(
    "admin",
    "billing",
    "You need billing access to manage billing settings, invoices, and payment methods."
  ),
  async (ctx): HandlerResult<GetMembersSeatsResponseBody> => {
    const auth = ctx.get("auth");

    const body = await getMembersSeats({ auth });
    return ctx.json(body);
  }
);

export default app;
