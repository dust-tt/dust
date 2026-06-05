/**
// @migration-status: MIGRATED_TO_HONO
 * @ignoreswagger
 */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { PostUserPodStarResponseBody } from "@app/lib/api/projects/preferences";
import { PostUserPodStarBodySchema } from "@app/lib/api/projects/preferences";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectPreferencesResource } from "@app/lib/resources/user_project_preferences_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PostUserPodStarResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "You can only star Pods.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const bodyValidation = PostUserPodStarBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${fromError(bodyValidation.error).toString()}`,
          },
        });
      }

      const body = bodyValidation.data;

      const preferenceResource =
        await UserProjectPreferencesResource.setStarred(auth, {
          spaceModelId: space.id,
          isStarred: body.starred,
        });

      return res.status(200).json(preferenceResource.toJSON());
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
