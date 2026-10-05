import { getUserForWorkspace } from "@app/lib/api/user";
import { getUserProfile } from "@app/lib/api/user_profile";
import type { GetUserProfileResponseBody } from "@app/types/api/user_profile";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";
import { z } from "zod";

const ParamsSchema = z.object({
  uId: z.string(),
});

// Mounted at /api/w/:wId/members/:uId/profile. Readable by any workspace member.
const app = workspaceApp();

app.use(withFeatureFlag("user_profile"));

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetUserProfileResponseBody> => {
    const auth = ctx.get("auth");
    const { uId } = ctx.req.valid("param");

    const user = await getUserForWorkspace(auth, { userId: uId });
    if (!user) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_user_not_found",
          message: "The user requested was not found.",
        },
      });
    }

    const profile = await getUserProfile(auth, user);

    return ctx.json({ profile });
  }
);

export default app;
