import type { GetSeatAvailabilityResponseBody } from "@app/lib/api/workspace";
import { checkWorkspaceSeatAvailabilityUsingAuth } from "@app/lib/api/workspace";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/seats/availability.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetSeatAvailabilityResponseBody> => {
    const auth = ctx.get("auth");

    const hasAvailableSeats =
      await checkWorkspaceSeatAvailabilityUsingAuth(auth);
    return ctx.json({ hasAvailableSeats });
  }
);

export default app;
