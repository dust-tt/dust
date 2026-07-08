import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import type {
  GetUserPodNotificationPreferenceResponseBody,
  PatchUserPodNotificationPreferenceResponseBody,
} from "@app/types/api/projects/preferences";
import { PatchUserPodNotificationPreferenceBodySchema } from "@app/types/api/projects/preferences";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

// Mounted under /api/w/:wId/spaces/:spaceId/project_notification_preferences.
const app = workspaceApp();

/**
 * @swagger
 * /api/w/{wId}/spaces/{spaceId}/project_notification_preferences:
 *   get:
 *     summary: Get project notification preference
 *     description: Returns the current user's notification preference for a project space.
 *     tags:
 *       - Private Spaces
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the project space
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userProjectNotificationPreference:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     sId:
 *                       type: string
 *                     spaceId:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     preference:
 *                       type: string
 *                       enum: [all_messages, only_mentions, never]
 *       400:
 *         description: Bad request (space is not a project)
 *       401:
 *         description: Unauthorized
 *   patch:
 *     summary: Set project notification preference
 *     description: Sets the current user's notification preference for a project space.
 *     tags:
 *       - Private Spaces
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: spaceId
 *         required: true
 *         description: ID of the project space
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preference
 *             properties:
 *               preference:
 *                 type: string
 *                 enum: [all_messages, only_mentions, never]
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userProjectNotificationPreference:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     sId:
 *                       type: string
 *                     spaceId:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     preference:
 *                       type: string
 *                       enum: [all_messages, only_mentions, never]
 *       400:
 *         description: Bad request (space is not a project or invalid body)
 *       401:
 *         description: Unauthorized
 */

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetUserPodNotificationPreferenceResponseBody> => {
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
  }
);

app.patch(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PatchUserPodNotificationPreferenceBodySchema),
  async (
    ctx
  ): HandlerResult<PatchUserPodNotificationPreferenceResponseBody> => {
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
