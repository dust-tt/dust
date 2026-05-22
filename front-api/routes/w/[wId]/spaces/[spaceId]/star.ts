import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { z } from "zod";

export type PostUserProjectStarResponseBody = {
  sId: string;
  spaceId: string;
  userId: string;
  isStarred: boolean;
};

const PostUserProjectStarBodySchema = z.object({
  starred: z.boolean(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/star.
const app = workspaceApp();

app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostUserProjectStarBodySchema),
  async (ctx): HandlerResult<PostUserProjectStarResponseBody> => {
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
