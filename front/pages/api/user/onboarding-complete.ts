import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getUserFromSession } from "@app/lib/iam/session";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isJobType } from "@app/types/job_type";

export type PostOnboardingCompleteResponseBody = {
  success: boolean;
};

const PostOnboardingCompleteBodySchema = t.type({
  jobType: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PostOnboardingCompleteResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const bodyValidation = PostOnboardingCompleteBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const user = await getUserFromSession(session);
  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "The user was not found.",
      },
    });
  }

  const u = await UserResource.fetchByModelId(user.id);
  if (!u) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  // Get the first workspace (assuming onboarding is for the primary workspace)
  const workspace = user.workspaces[0];
  if (!workspace) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "User has no associated workspace.",
      },
    });
  }

  const { jobType } = bodyValidation.right;

  if (!isJobType(jobType)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Job type is invalid.",
      },
    });
  }

  const metadata = {
    job_type: jobType,
  };

  try {
    // Go through each key of the jobType to store
    for (const [key, value] of Object.entries(metadata)) {
      await u.setMetadata(key, String(value));
    }

    // Then track
    await ServerSideTracking.trackCompleteUserOnboarding({
      user: user,
      workspace: renderLightWorkspaceType({ workspace }),
      role: workspace.role !== "none" ? workspace.role : "user",
      jobType,
    });

    logger.info(
      {
        userId: user.sId,
        workspaceId: workspace.sId,
        metadataKeys: Object.keys(metadata),
      },
      "Successfully tracked onboarding completion"
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error(
      { error, userId: user.sId, workspaceId: workspace.sId },
      "Failed to track onboarding completion"
    );

    // Don't fail the request if tracking fails - onboarding should continue
    return res.status(200).json({ success: true });
  }
}

export default withSessionAuthentication(handler);
