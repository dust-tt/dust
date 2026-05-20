import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { NOTIFICATION_CONDITION_OPTIONS } from "@app/types/notification_preferences";
import { spaceResource } from "@front-api/middleware/space_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PatchUserProjectNotificationPreferenceBodySchema = z.object({
  preference: z.enum(NOTIFICATION_CONDITION_OPTIONS),
});

// Mounted under /api/w/:wId/spaces/:spaceId/project_notification_preferences.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Project notification preferences are only available for project spaces.",
        },
      });
    }

    const preference = await UserProjectPreferencesResource.fetchBySpace(
      auth,
      space.id
    );
    const serialized = preference?.toJSON();
    return c.json({
      userProjectNotificationPreference:
        serialized && serialized.notificationPreference !== null
          ? {
              sId: serialized.sId,
              spaceId: serialized.spaceId,
              userId: serialized.userId,
              preference: serialized.notificationPreference,
            }
          : null,
    });
  }
);

app.patch(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PatchUserProjectNotificationPreferenceBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");

    if (!space.isProject()) {
      return apiError(c, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Project notification preferences are only available for project spaces.",
        },
      });
    }

    const body = c.req.valid("json");

    const preferenceResource =
      await UserProjectPreferencesResource.setNotificationPreference(auth, {
        spaceModelId: space.id,
        notificationPreference: body.preference,
      });

    const serialized = preferenceResource.toJSON();
    return c.json({
      userProjectNotificationPreference:
        serialized.notificationPreference !== null
          ? {
              sId: serialized.sId,
              spaceId: serialized.spaceId,
              userId: serialized.userId,
              preference: serialized.notificationPreference,
            }
          : null,
    });
  }
);

export default app;
