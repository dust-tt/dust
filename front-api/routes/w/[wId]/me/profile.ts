import { getUserProfile, updateUserProfile } from "@app/lib/api/user_profile";
import type { PatchMyProfileResponseBody } from "@app/types/api/user_profile";
import { PatchMyProfileBodySchema } from "@app/types/api/user_profile";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/w/:wId/me/profile. Always scoped to the authenticated user's own profile.
const app = workspaceApp();

app.use(withFeatureFlag("user_profile"));

/** @ignoreswagger */
app.patch(
  "/",
  validate("json", PatchMyProfileBodySchema),
  async (ctx): HandlerResult<PatchMyProfileResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const body = ctx.req.valid("json");

    const result = await updateUserProfile(auth, user, body);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }
    const profile = await getUserProfile(auth, user);

    return ctx.json({ profile });
  }
);

export default app;
