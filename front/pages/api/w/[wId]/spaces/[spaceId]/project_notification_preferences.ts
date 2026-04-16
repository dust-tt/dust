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
 *       405:
 *         description: Method not supported
 */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectNotificationPreferenceResource } from "@app/lib/resources/user_project_notification_preferences_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import {
  NOTIFICATION_CONDITION_OPTIONS,
  type UserProjectNotificationPreference,
} from "@app/types/notification_preferences";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export type GetUserProjectNotificationPreferenceResponseBody = {
  userProjectNotificationPreference: UserProjectNotificationPreference | null;
};

export type PatchUserProjectNotificationPreferenceResponseBody = {
  userProjectNotificationPreference: UserProjectNotificationPreference | null;
};

const PatchUserProjectNotificationPreferenceBodySchema = z.object({
  preference: z.enum(NOTIFICATION_CONDITION_OPTIONS),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetUserProjectNotificationPreferenceResponseBody
      | PatchUserProjectNotificationPreferenceResponseBody
    >
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  // Only project spaces can have notification preferences
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Project notification preferences are only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const preference =
        await UserProjectNotificationPreferenceResource.fetchByProject(
          auth,
          space.id
        );
      return res.status(200).json({
        userProjectNotificationPreference: preference
          ? preference.toJSON()
          : null,
      });
    }

    case "PATCH": {
      const bodyValidation =
        PatchUserProjectNotificationPreferenceBodySchema.safeParse(req.body);

      if (!bodyValidation.success) {
        const errorMessage = bodyValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${errorMessage}`,
          },
        });
      }

      const body = bodyValidation.data;

      const preferenceResource =
        await UserProjectNotificationPreferenceResource.setPreference(auth, {
          spaceModelId: space.id,
          preference: body.preference,
        });

      return res.status(200).json({
        userProjectNotificationPreference: preferenceResource.toJSON(),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET or PATCH expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
