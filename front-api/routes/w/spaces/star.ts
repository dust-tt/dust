import { Hono } from "hono";
import { z } from "zod";

import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";

import { spaceResource } from "../../../middleware/space_resource";
import { validate } from "../../../middleware/validator";

const PostUserProjectStarBodySchema = z.object({
  starred: z.boolean(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/star.
export const starApp = new Hono();

starApp.post(
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
            message: "Project star is only available for project spaces.",
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
