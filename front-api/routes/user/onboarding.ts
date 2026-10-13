import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { SUPPORTED_LOCALES, USER_LOCALE_METADATA_KEY } from "@app/types/locale";
import { ONBOARDING_PROFILE_PENDING_METADATA_KEY } from "@app/types/onboarding";
import { sessionApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PostUserOnboardingCompleteResponseBody = {
  success: boolean;
};

const PostUserOnboardingCompleteBodySchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).nullable(),
});

// Mounted at /api/user/onboarding. sessionAuth is applied by the parent
// `/api/user` sub-app.
const app = sessionApp();

// Marks the profile onboarding as completed for the user, by clearing the
// pending marker from the user metadata. Called when the user submits the
// profile onboarding form (welcome page or in-app onboarding dialog).
/**
 * @cc [owner:ykmsd,label:product;api] complete-saves-onboarding-locale
 * The body's `locale` is required but nullable. A non-null `locale` MUST be saved as the user's
 * global locale (the `locale` user metadata) before responding, and a `null` one MUST leave the
 * user's locale unchanged. A missing `locale`, or one that is not one of `SUPPORTED_LOCALES`, MUST
 * be rejected with a 400 without completing the onboarding.
 */
/** @ignoreswagger */
app.post(
  "/complete",
  validate("json", PostUserOnboardingCompleteBodySchema),
  async (ctx): HandlerResult<PostUserOnboardingCompleteResponseBody> => {
    const session = ctx.get("session");
    const user = await getUserFromSession(session);
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "The user was not found.",
        },
      });
    }

    // We get the UserResource from the session userId. Temporary, as we'd need
    // to refactor getUserFromSession to return the UserResource directly.
    const u = await UserResource.fetchByModelId(user.id);
    if (!u) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "Could not find the user.",
        },
      });
    }

    const { locale } = ctx.req.valid("json");
    if (locale !== null) {
      await u.setMetadata(USER_LOCALE_METADATA_KEY, locale);
    }

    await u.setMetadata(ONBOARDING_PROFILE_PENDING_METADATA_KEY, "false");

    return ctx.json({ success: true });
  }
);

export default app;
