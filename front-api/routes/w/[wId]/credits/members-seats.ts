import {
  type GetMembersSeatsResponseBody,
  getMembersSeats,
} from "@app/lib/api/credits/members_seats";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/credits/members-seats.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetMembersSeatsResponseBody> => {
    const auth = ctx.get("auth");

    const body = await getMembersSeats({ auth });
    return ctx.json(body);
  }
);

export default app;
