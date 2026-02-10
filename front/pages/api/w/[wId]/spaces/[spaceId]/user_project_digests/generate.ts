import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { UserProjectDigestResource } from "@app/lib/resources/user_project_digest_resource";
import { apiError } from "@app/logger/withlogging";
import { launchUserProjectGenerationWorkflow } from "@app/temporal/project_user_digest_queue/client";
import type { WithAPIErrorResponse } from "@app/types";

// const COOLDOWN_HOURS = 24;
// const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
const COOLDOWN_MS = 0;

export type PostGenerateUserProjectDigestResponseBody = {
  success: true;
};

export async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostGenerateUserProjectDigestResponseBody>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
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
    case "POST": {
      // Check cooldown - get the latest digest.
      const existingDigests = await UserProjectDigestResource.fetchBySpace(
        auth,
        space.id,
        { limit: 1 }
      );

      const latestDigest = existingDigests[0] || null;
      if (latestDigest) {
        const timeSinceLastDigestMs =
          Date.now() - new Date(latestDigest.createdAt).getTime();
        if (timeSinceLastDigestMs < COOLDOWN_MS) {
          const remainingHours = Math.ceil(
            (COOLDOWN_MS - timeSinceLastDigestMs) / (60 * 60 * 1000)
          );
          return apiError(req, res, {
            status_code: 429,
            api_error: {
              type: "rate_limit_error",
              message: `Please wait ${remainingHours} hour${remainingHours > 1 ? "s" : ""} before generating a new digest.`,
            },
          });
        }
      }

      // Launch async workflow to generate the digest.
      const workflowResult = await launchUserProjectGenerationWorkflow({
        auth,
        spaceId: space.sId,
      });

      if (workflowResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to start digest generation: ${workflowResult.error.message}`,
          },
        });
      }

      return res.status(202).json({
        success: true,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
