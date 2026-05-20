import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { withSpace } from "@front-api/middleware/with_space";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostUserProjectStarBodySchema = z.object({
  starred: z.boolean(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/star.
const app = new Hono();

app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostUserProjectStarBodySchema),
  async (ctx) => {
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
