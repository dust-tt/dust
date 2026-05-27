import { getMembers } from "@app/lib/api/workspace";
import type {
  GetWorkspaceMembersResponseBody,
  UserType,
} from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import type { HandlerResult } from "@front-api/middlewares/utils";

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
      users: users.map(
        (user): Pick<UserType, "sId" | "id" | "email"> => ({
          sId: user.sId,
          id: user.id,
          email: user.email,
        })
      ),
    });
  }
);

export default app;
