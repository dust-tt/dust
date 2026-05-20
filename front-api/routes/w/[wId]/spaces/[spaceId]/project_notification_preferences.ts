import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { NOTIFICATION_CONDITION_OPTIONS } from "@app/types/notification_preferences";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";
import { z } from "zod";

const PatchUserProjectNotificationPreferenceBodySchema = z.object({
  preference: z.enum(NOTIFICATION_CONDITION_OPTIONS),
});

// Mounted under /api/w/:wId/spaces/:spaceId/project_notification_preferences.
const app = new Hono();

app.get("/", withSpace({ requireCanReadOrAdministrate: true }), async (ctx) => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  if (!space.isProject()) {
    return apiError(ctx, {
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
  return ctx.json({
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
});

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchUserProjectNotificationPreferenceBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.isProject()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "Project notification preferences are only available for project spaces.",
        },
      });
    }

    const body = ctx.req.valid("json");

    const preferenceResource =
      await UserProjectPreferencesResource.setNotificationPreference(auth, {
        spaceModelId: space.id,
        notificationPreference: body.preference,
      });

    const serialized = preferenceResource.toJSON();
    return ctx.json({
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
