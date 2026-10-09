import { hasFeatureFlag } from "@app/lib/auth";
import type { GetMemberLocaleResponseType } from "@dust-tt/client";
import { GetMemberLocaleRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

/**
 * @ignoreswagger
 * System API key only endpoint, used by the Slack bot to render its messages in the user's
 * locale. Undocumented.
 */

// Mounted at /api/v1/w/:wId/members/locale. The email is sent in the body, not the query string,
// as it is personal data.
/**
 * @cc [owner:Nils-Fedrigo,label:product;api] member-locale-response
 * `workspaceLocale` MUST be the workspace's `locale`. `userLocale` MUST be the `getStoredLocale` of
 * the user whose active membership in the workspace, among the users with this email, is the oldest,
 * and `null` when no email is given or no user with this email is an active member.
 * `localisationEnabled` MUST be whether the workspace has the `localisation` feature flag.
 */
const app = publicApiApp();

app.post(
  "/",
  ensureIsSystemKey(),
  validate("json", GetMemberLocaleRequestSchema),
  async (ctx): HandlerResult<GetMemberLocaleResponseType> => {
    const auth = ctx.get("auth");
    const { email } = ctx.req.valid("json");

    const [localisationEnabled, userAuth] = await Promise.all([
      hasFeatureFlag(auth, "localisation"),
      email
        ? auth.exchangeSystemKeyForUserAuthByEmail(auth, { userEmail: email })
        : null,
    ]);
    const user = userAuth?.user() ?? null;

    return ctx.json({
      localisationEnabled,
      userLocale: user ? await user.getStoredLocale() : null,
      workspaceLocale: auth.getNonNullableWorkspace().locale,
    });
  }
);

export default app;
