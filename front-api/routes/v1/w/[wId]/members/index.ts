import { getMembers } from "@app/lib/api/workspace";
import { toBaseSeatType } from "@app/types/memberships";
import type { GetWorkspaceMembersResponseBody } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";

import emails from "./emails";
import locale from "./locale";
import validate from "./validate";

// Mounted at /api/v1/w/:wId/members. publicApiAuth is applied by the parent
// v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

/**
 * @ignoreswagger
 * Admin-only endpoint. Undocumented.
 */
app.get(
  "/",
  ensureIsAdmin(),
  async (ctx): HandlerResult<GetWorkspaceMembersResponseBody> => {
    const auth = ctx.get("auth");

    const { members: users } = await getMembers(auth, { activeOnly: true });

    return ctx.json({
      users: users.map((user) => ({
        sId: user.sId,
        id: user.id,
        email: user.email,
        seatType: toBaseSeatType(user.seatType),
      })),
    });
  }
);

app.route("/emails", emails);
app.route("/locale", locale);
app.route("/validate", validate);

export default app;
