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
