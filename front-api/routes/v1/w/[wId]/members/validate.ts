import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ValidateMemberResponseType } from "@dust-tt/client";
import { ValidateMemberRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @ignoreswagger
 * Validates an email corresponds to an active member in a specific workspace. For Dust managed apps only - undocumented.
 */

// Mounted at /api/v1/w/:wId/members/validate.
const app = publicApiApp();

app.post(
  "/",
  validate("json", ValidateMemberRequestSchema),
  async (ctx): HandlerResult<ValidateMemberResponseType> => {
    const auth = ctx.get("auth");
    const { email } = ctx.req.valid("json");

    const users = await UserResource.listByEmail(email);
    const workspace = auth.getNonNullableWorkspace();

    if (!users.length) {
      return ctx.json({
        valid: false,
      });
    }

    // Check memberships for all users with this email until we find an active one
    for (const user of users) {
      const workspaceMembership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace,
        });

      if (workspaceMembership) {
        return ctx.json({
          valid: true,
        });
      }
    }

    return ctx.json({
      valid: false,
    });
  }
);

export default app;
