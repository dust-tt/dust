import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectDigestResource } from "@app/lib/resources/user_project_digest_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { UserProjectDigestType } from "@app/types/user_project_digest";
import type { NextApiRequest, NextApiResponse } from "next";

const MAX_USER_PROJECT_DIGESTS = 10;

export type GetUserProjectDigestsResponseBody = {
  digests: UserProjectDigestType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetUserProjectDigestsResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("project_butler")) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "feature_flag_not_found",
        message:
          "The project butler feature is not enabled for this workspace.",
      },
    });
  }

  // Only project spaces can have digests.
  if (!space.isProject()) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "User project digests are only available for project spaces.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const { limit } = req.query;
      const limitNumber = limit && isString(limit) ? parseInt(limit, 10) : 10;

      if (
        isNaN(limitNumber) ||
        limitNumber < 1 ||
        limitNumber > MAX_USER_PROJECT_DIGESTS
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Limit must be a number between 1 and ${MAX_USER_PROJECT_DIGESTS}`,
          },
        });
      }

      const digests = await UserProjectDigestResource.fetchBySpace(
        auth,
        space.id,
        { limit: limitNumber }
      );

      return res.status(200).json({
        digests: digests.map((d) => d.toJSON()),
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
