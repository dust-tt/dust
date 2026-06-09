import { hasActiveMemberByEmail } from "@app/lib/api/workspace";
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

    const valid = await hasActiveMemberByEmail({
      email,
      workspace: auth.getNonNullableWorkspace(),
    });

    return ctx.json({ valid });
  }
);

export default app;
