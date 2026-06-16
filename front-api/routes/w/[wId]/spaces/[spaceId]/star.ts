import type { PostUserPodStarResponseBody } from "@app/lib/api/projects/preferences";
import { PostUserPodStarBodySchema } from "@app/lib/api/projects/preferences";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/star.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostUserPodStarBodySchema),
  async (ctx): HandlerResult<PostUserPodStarResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { starred } = ctx.req.valid("json");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "You can only star Pods.",
        },
      });
    }

    const pref = await UserProjectPreferencesResource.setStarred(auth, {
      spaceModelId: space.id,
      isStarred: starred,
    });

    return ctx.json(pref.toJSON());
  }
);

export default app;
