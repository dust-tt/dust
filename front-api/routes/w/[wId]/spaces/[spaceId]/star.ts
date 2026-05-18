import { Hono } from "hono";
import { z } from "zod";

import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const PostUserProjectStarBodySchema = z.object({
  starred: z.boolean(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/star.
const app = new Hono();

app.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PostUserProjectStarBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const { starred } = c.req.valid("json");

    if (!space.isProject()) {
      return c.json(
        {
          error: {
            type: "invalid_request_error",
            message: "Pod star is only available for pod spaces.",
          },
        },
        400
      );
    }

    const pref = await UserProjectPreferencesResource.setStarred(auth, {
      spaceModelId: space.id,
      isStarred: starred,
    });

    return c.json(pref.toJSON());
  }
);

export default app;
