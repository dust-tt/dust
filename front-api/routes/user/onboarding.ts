import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { ONBOARDING_PROFILE_PENDING_METADATA_KEY } from "@app/types/onboarding";
import { sessionApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type PostUserOnboardingCompleteResponseBody = {
  success: boolean;
};

// Mounted at /api/user/onboarding. sessionAuth is applied by the parent
// `/api/user` sub-app.
const app = sessionApp();

// Marks the profile onboarding as completed for the user, by clearing the
// pending marker from the user metadata. Called when the user submits the
// profile onboarding form (welcome page or in-app onboarding dialog).
/** @ignoreswagger */
app.post(
  "/complete",
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

    await u.setMetadata(ONBOARDING_PROFILE_PENDING_METADATA_KEY, "false");

    return ctx.json({ success: true });
  }
);

export default app;
